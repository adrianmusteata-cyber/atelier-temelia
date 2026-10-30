/* Vizualizare proiect: schița generată din 1–3 poze, fără dependențe.
   Folosit de /api/contact?action=viz-* (vizitatorii site-ului) și de /api/admin/docs/viz-* (echipa).
   Furnizorul: IMAGE_PROVIDER = 'cloudflare' (implicit, nivelul gratuit zilnic Workers AI) | 'gemini' (cere facturare Google).
   Cloudflare: CF_ACCOUNT_ID, CF_AI_TOKEN (token API cu permisiunea Workers AI), CF_IMAGE_MODEL (opțional).
   Gemini:     GEMINI_API_KEY, GEMINI_IMAGE_MODEL (opțional; fără ea se încearcă pe rând modelele din DEFAULT_MODELS).
   Cheile stau doar pe server, se trimit în antet (nu în adresă) și nu ajung în loguri.
   Fluxul: rezervarea (rândul „pending” + linkuri semnate spre tmp/<token>/) → browserul urcă pozele →
   generarea (descărcare, apelul furnizorului, schița în viz/<id>/output.*, pozele mutate în viz/<id>/input-<n>.*). */
const crypto = require('crypto');
const { rest } = require('./db');
const store = require('./storage');
const { countHits, addHit } = require('./rate');

/* ---------- Limitele (de schimbat aici) ---------- */
const PUBLIC_PER_IP_DAY = 2;     // vizitator (amprenta IP-ului), pe zi
const PUBLIC_PER_PHONE = 3;      // același număr de telefon, pentru totdeauna
const SITE_PER_DAY = 20;         // plafonul site-ului: toate generările publice dintr-o zi
const TEAM_PER_DAY = 5;          // om din echipă (tg:<id> sau „owner” din browser), pe zi
const TRIES_PER_HOUR = 10;       // încercări (anti-buclă), reușite sau nu
const RESERVE_MS = 15 * 60e3;    // rezervarea și pozele din tmp/ sunt valabile 15 minute
const GEMINI_TIMEOUT = 50000;    // funcția are 60 s (vercel.json); restul timpului e pentru Storage
const TZ = 'Europe/Chisinau';    // ziua limitelor: ora Moldovei, resetare la 00:00

const MAX_FILES = 3;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_WISHES = 1000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

const KINDS = { casa_noua: 'Casă nouă pe teren', fatada: 'Fațadă / renovare exterior', interior: 'Interior' };

/* Modelul. DE VERIFICAT pe cheia utilizatorului, cu
   GET https://generativelanguage.googleapis.com/v1beta/models (antetul x-goog-api-key), și pus în GEMINI_IMAGE_MODEL.
   Fără variabilă se încearcă pe rând (un 404 = modelul nu există pe cont, nu costă nimic):
   Nano Banana 2.1 din specificație, apoi rezervele; gemini-2.5-flash-image se închide pe 15.03.2027. */
const DEFAULT_MODELS = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'];
const models = () => {
  const m = String(process.env.GEMINI_IMAGE_MODEL || '').trim();
  return m ? [m] : DEFAULT_MODELS;
};
const API = 'https://generativelanguage.googleapis.com/v1beta';

/* Cloudflare Workers AI. Modelul implicit: FLUX.2 [klein] 4B — primește până la 4 poze de referință
   (input_image_0…3, fiecare sub 512×512) și editează pornind de la ele, deci păstrează terenul / clădirea / camera;
   costă ~110 neuroni pe o schiță 1024×768, adică ~90 de schițe pe zi în cei 10 000 de neuroni gratuiți.
   Alternativa veche @cf/runwayml/stable-diffusion-v1-5-img2img (o singură poză, 512 px, calitate mult mai slabă)
   merge și ea, dacă se pune în CF_IMAGE_MODEL. */
const CF_DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const CF_TRANSLATE_MODEL = '@cf/meta/m2m100-1.2b';
const env = k => String(process.env[k] || '').trim();
const provider = () => (env('IMAGE_PROVIDER').toLowerCase() === 'gemini' ? 'gemini' : 'cloudflare');
const cfModel = () => env('CF_IMAGE_MODEL') || CF_DEFAULT_MODEL;
const isFlux2 = m => /flux-2/i.test(m);
const configured = () => (provider() === 'gemini' ? !!env('GEMINI_API_KEY') : !!(env('CF_ACCOUNT_ID') && env('CF_AI_TOKEN')));
// Latura mare a pozelor pe care le micșorează browserul: FLUX.2 pe Cloudflare cere poze sub 512×512
const maxSide = () => (provider() === 'gemini' ? 2048 : isFlux2(cfModel()) ? 500 : 512);
const modelName = () => (provider() === 'gemini' ? models()[0] : cfModel());

/* Prompturile: text fix în engleză; dorințele omului se pun la sfârșit, între ghilimele.
   Textul se ajustează după câteva probe pe poze reale (teren, fațadă, cameră). */
const PROMPTS = {
  casa_noua: 'Using the photo of the empty plot, create a realistic architectural visualization of a new house on this exact site, ' +
    'same viewpoint, lighting and surroundings. Keep the terrain, neighbouring buildings, trees and sky as in the photo. ' +
    'The house should look buildable, with believable proportions, materials and landscaping.',
  fatada: 'Renovate the facade of this building, keep its volume, viewpoint and surroundings. ' +
    'Keep the number of floors, the roof shape and the position of the openings unless the client asks otherwise. ' +
    'Show a realistic, buildable renovation with modern materials and careful details.',
  interior: "Redesign this room's interior, keep the walls, windows and perspective. " +
    'Keep the camera position and the room size; change finishes, furniture and lighting into a coherent, realistic design.',
};
const COMMON = 'Photorealistic architectural visualization. No text, no watermark, no people.';

// Ghilimelele și caracterele de control ale omului nu pot „ieși” din citat
const cleanWishes = s => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/"/g, "'").trim().slice(0, MAX_WISHES);
const buildPrompt = (kind, wishes) => `${PROMPTS[kind]} ${COMMON} Client wishes: "${cleanWishes(wishes) || 'none'}"`;

// Eroare cu cod: timeout, rejected (filtrul de siguranță), service (orice altceva), viz_off
const coded = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);

/* ---------- Ziua după ora Moldovei ---------- */
function tzOffsetMin(ms) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName');
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(part ? part.value : '');
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
// Ora 00:00 de azi la Chișinău, ca ISO (UTC); în zilele cu schimbarea orei se recalculează cu decalajul de la miezul nopții
function dayStart(now = Date.now()) {
  const date = new Date(now).toLocaleDateString('sv-SE', { timeZone: TZ });
  const base = Date.parse(`${date}T00:00:00Z`);
  let t = base - tzOffsetMin(now) * 60e3;
  t = base - tzOffsetMin(t) * 60e3;
  return new Date(t).toISOString();
}

// Telefonul pentru limită: doar cifrele, fără 00 / 373 / 0 de la început („+373 68 133 945” = „068133945” = „68133945”)
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  d = d.replace(/^00/, '');
  if (d.startsWith('373')) d = d.slice(3);
  return d.replace(/^0+/, '');
}

/* ---------- Numărătoarea ---------- */
// Se numără reușitele, refuzurile de siguranță și rezervările în curs mai noi de 15 minute; „failed” nu se numără
const counted = (now = Date.now()) =>
  `or=(status.in.(done,rejected),and(status.eq.pending,created_at.gt.${encodeURIComponent(new Date(now - RESERVE_MS).toISOString())}))`;

async function countGen(filter, now = Date.now()) {
  const rows = await rest(`generations?select=id&${filter}&${counted(now)}&limit=1000`);
  return rows.length;
}

// Vizitatorul: întoarce limita atinsă ('limit_ip' | 'limit_phone' | 'limit_site') sau null
async function publicLimit({ ipKey, phoneKey }, now = Date.now()) {
  const since = encodeURIComponent(dayStart(now));
  const [ip, phone, site] = await Promise.all([
    countGen(`origin=eq.public&actor_key=eq.${encodeURIComponent(ipKey)}&created_at=gte.${since}`, now),
    countGen(`origin=eq.public&phone_key=eq.${encodeURIComponent(phoneKey)}`, now),
    countGen(`origin=eq.public&created_at=gte.${since}`, now),
  ]);
  if (ip >= PUBLIC_PER_IP_DAY) return 'limit_ip';
  if (phone >= PUBLIC_PER_PHONE) return 'limit_phone';
  if (site >= SITE_PER_DAY) return 'limit_site';
  return null;
}

// Câte generări are azi omul din echipă (plafonul site-ului nu le include)
const teamUsed = (actorKey, now = Date.now()) =>
  countGen(`origin=eq.team&actor_key=eq.${encodeURIComponent(actorKey)}&created_at=gte.${encodeURIComponent(dayStart(now))}`, now);
const teamLimit = async (actorKey, now) => ((await teamUsed(actorKey, now)) >= TEAM_PER_DAY ? 'limit_team' : null);

// Încercările dintr-o oră (reușite sau nu): false = peste limită, altfel încercarea se înregistrează
async function tryHit(key) {
  const k = `viz-try:${key}`;
  if (await countHits(k, 36e5) >= TRIES_PER_HOUR) return false;
  await addHit(k);
  return true;
}

/* ---------- Fișierele ---------- */
const tmpDir = token => `tmp/${token}`;

// Lista trimisă de browser înainte de încărcare: [{ page: 1..3, mime, size }]
function validFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) return false;
  const pages = files.map(f => f && f.page);
  return new Set(pages).size === files.length && files.every(f => f && EXT[f.mime] &&
    Number.isInteger(f.page) && f.page >= 1 && f.page <= MAX_FILES &&
    Number.isInteger(f.size) && f.size > 0 && f.size <= MAX_FILE);
}

// Pozele urcate: [{ name, page, mime, size }]; { error: 'files' } dacă ceva nu e în regulă (mărimea reală)
async function tmpFiles(token) {
  const rows = await store.list(tmpDir(token));
  const files = rows.filter(r => r.id && /^[1-3]\.(jpg|png|webp)$/.test(r.name))
    .map(r => ({ name: r.name, page: Number(r.name[0]), mime: MIME[r.name.split('.')[1]], size: Number(r.metadata?.size || 0) }))
    .sort((a, b) => a.page - b.page);
  if (files.some(f => !f.size || f.size > MAX_FILE)) return { error: 'files', files };
  return { files };
}

async function dropTmp(token) {
  if (!token) return;
  const files = await store.list(tmpDir(token)).catch(() => []);
  await store.remove(files.filter(f => f.id).map(f => `${tmpDir(token)}/${f.name}`)).catch(() => {});
}

/* ---------- Rezervarea ---------- */
// Rândul „pending” intră imediat în numărătoare; browserul primește linkurile de încărcare în tmp/<token>/
async function reserve({ origin, kind, wishes = '', request_id = null, actor = '', actor_key, phone_key = '', files }, now = Date.now()) {
  const token = crypto.randomUUID();
  const [row] = await rest('generations', {
    method: 'POST',
    body: {
      origin, kind, wishes: cleanWishes(wishes), status: 'pending', request_id, actor, actor_key, phone_key,
      token, token_expires_at: new Date(now + RESERVE_MS).toISOString(),
    },
    prefer: 'return=representation',
  });
  const uploads = await Promise.all(files.map(async f => ({
    page: f.page,
    url: await store.signUpload(`${tmpDir(token)}/${f.page}.${EXT[f.mime]}`),
  })));
  return { id: row.id, token, uploads };
}

const COLS = 'id,created_at,request_id,origin,kind,wishes,status,error,model,input_paths,output_path,actor,actor_key,phone_key,token,token_expires_at,started_at';
async function findByToken(token) {
  const [row] = await rest(`generations?select=${COLS}&token=eq.${encodeURIComponent(token)}`);
  return row || null;
}
const isExpired = (row, now = Date.now()) => !row.token_expires_at || Date.parse(row.token_expires_at) < now;

/* Generarea începe doar dacă rândul e încă în starea citită: un dublu clic sau două tab-uri nu cheamă Gemini de două ori.
   Un „failed” (eroare, timeout) se poate încerca din nou cât rezervarea e valabilă: redevine „pending”. */
async function claim(row, patch = {}) {
  const cond = row.status === 'pending' ? '&status=eq.pending&started_at=is.null' : `&status=eq.${row.status}`;
  const [claimed] = await rest(`generations?id=eq.${row.id}${cond}`, {
    method: 'PATCH',
    body: { ...patch, status: 'pending', error: '', started_at: new Date().toISOString() },
    prefer: 'return=representation',
  });
  return claimed || null;
}

/* ---------- Apelul la Gemini ---------- */
const BLOCKED = /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/i;

// Imaginea din răspuns sau eroarea potrivită (REST întoarce camelCase; acceptăm și snake_case)
function parseResponse(data, model) {
  const block = data && data.promptFeedback && data.promptFeedback.blockReason;
  if (block) throw coded('rejected', `Gemini a refuzat poza (${block})`);
  const cand = ((data && data.candidates) || [])[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const img = parts.map(p => p.inlineData || p.inline_data).find(d => d && d.data);
  if (img) {
    const mime = img.mimeType || img.mime_type || 'image/png';
    return { data: Buffer.from(img.data, 'base64'), mime: EXT[mime] ? mime : 'image/png', model };
  }
  const reason = (cand && cand.finishReason) || 'fără imagine';
  if (BLOCKED.test(reason)) throw coded('rejected', `Gemini a refuzat poza (${reason})`);
  throw coded('service', `Gemini nu a întors nicio imagine (${reason})`);
}

// Gemini: images: [{ mime, data: Buffer }] → { data: Buffer, mime, model }
async function geminiImage(images, prompt, timeout = GEMINI_TIMEOUT) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw coded('viz_off', 'Lipsește GEMINI_API_KEY');
  const parts = images.map(i => ({ inline_data: { mime_type: i.mime, data: i.data.toString('base64') } }));
  parts.push({ text: prompt });
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'] } });
  const deadline = Date.now() + timeout;
  let last = null;
  for (const model of models()) {
    const left = deadline - Date.now();
    if (left < 2000) throw coded('timeout', `Gemini nu a răspuns în ${Math.round(timeout / 1000)} s`);
    let r, data;
    try {
      // Cheia stă în antet, nu în adresă: adresa poate ajunge în loguri, antetul nu
      r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(left),
      });
      data = await r.json().catch(() => ({}));
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw coded('timeout', `Gemini nu a răspuns în ${Math.round(timeout / 1000)} s`);
      throw coded('service', `Gemini nu răspunde: ${e.message}`);
    }
    // Modelul nu există pe acest cont: următorul din listă
    if (r.status === 404) { last = coded('service', `Modelul ${model} nu e disponibil (404)`); continue; }
    if (!r.ok) {
      const msg = String((data && data.error && data.error.message) || '').slice(0, 200);
      const st = String((data && data.error && data.error.status) || '');
      // Siguranță: unele refuzuri vin ca 400 cu motivul în mesaj
      if (r.status === 400 && BLOCKED.test(msg)) throw coded('rejected', `Gemini a refuzat poza: ${msg}`);
      // Fonduri, cotă, cheie blocată: proprietarul primește o alertă (o dată pe zi)
      const billing = r.status === 403 || r.status === 429 || /billing|quota|RESOURCE_EXHAUSTED|PERMISSION_DENIED/i.test(msg + st);
      throw coded('service', `Gemini ${r.status}${st ? ` ${st}` : ''}: ${msg}`, { billing, httpStatus: r.status, alert: `Gemini ${r.status}. Verifică facturarea Google` });
    }
    return parseResponse(data, model);
  }
  throw last || coded('service', 'Niciun model de imagine disponibil');
}

/* ---------- Cloudflare Workers AI ---------- */
// Lățimea și înălțimea pozei din antet (JPEG / PNG), fără bibliotecă; null dacă nu se poate citi
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}
const sniff = buf => (buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg'
  : buf.slice(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/png');
// Schița: latura mare 1024, cu proporțiile primei poze (multiplu de 16, între 256 și 1920)
function outputSize(size) {
  if (!size || !size.w || !size.h) return { width: 1024, height: 768 };
  const r = size.w / size.h, m16 = v => Math.min(1920, Math.max(256, Math.round(v / 16) * 16));
  return r >= 1 ? { width: 1024, height: m16(1024 / r) } : { width: m16(1024 * r), height: 1024 };
}

async function cfRun(model, init, timeout) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env('CF_ACCOUNT_ID'))}/ai/run/${model}`;
  try {
    return await fetch(url, {
      method: 'POST', ...init,
      headers: { Authorization: `Bearer ${env('CF_AI_TOKEN')}`, ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw coded('timeout', `Cloudflare nu a răspuns în ${Math.round(timeout / 1000)} s`);
    throw coded('service', `Cloudflare nu răspunde: ${e.message}`);
  }
}

// Erorile Cloudflare: limita zilnică gratuită (nu se numără), conținut refuzat (se numără), restul = serviciul
function cfError(status, data) {
  const errs = (data && data.errors) || [];
  const msg = errs.map(e => `${e.code || ''} ${e.message || ''}`.trim()).join('; ').slice(0, 200) || String((data && data.error) || '').slice(0, 200);
  const text = `Cloudflare ${status}: ${msg}`;
  if (status === 429 || /daily free allocation|neurons|quota|4006|rate limit|too many requests/i.test(msg)) {
    return coded('quota', text, { alert: 'limita gratuită zilnică Cloudflare Workers AI (10 000 de neuroni) e atinsă; se resetează la 00:00 UTC' });
  }
  if (/nsfw|unsafe|safety|flagged|inappropriate|content polic|prohibited/i.test(msg)) return coded('rejected', text);
  if (status === 401 || status === 403) return coded('service', text, { alert: `Cloudflare ${status}: verifică CF_AI_TOKEN (permisiunea Workers AI) și CF_ACCOUNT_ID` });
  return coded('service', text);
}

// Dorințele în engleză (doar pentru prompt), cu modelul de traducere Workers AI; la orice problemă rămâne textul original.
// Textul fără diacritice și fără cuvinte românești uzuale e luat drept englezesc și nu se traduce.
const RO_WORDS = /\b(si|cu|casa|case|acoperis|etaj|etaje|lemn|piatra|ferestre|fereastra|alb|alba|gri|terasa|curte|gard|bucatarie|dormitor|baie|vreau|doresc|moderna)\b/i;
async function toEnglish(text, timeout = 8000) {
  const t = cleanWishes(text);
  if (!t || (!/[^\x00-\x7f]/.test(t) && !RO_WORDS.test(t))) return t;
  try {
    const r = await cfRun(CF_TRANSLATE_MODEL, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, source_lang: /[Ѐ-ӿ]/.test(t) ? 'russian' : 'romanian', target_lang: 'english' }),
    }, timeout);
    const data = await r.json().catch(() => ({}));
    const out = r.ok && data && data.result && data.result.translated_text;
    return out ? cleanWishes(out) : t;
  } catch (e) {
    return t;
  }
}

const cfPrompt = (kind, wishesEn, count) =>
  `Image 0 is the client's own photo${count > 1 ? '; the other images show the same place from other angles' : ''}. ` +
  `${PROMPTS[kind]} Keep the place clearly recognisable from image 0. ` +
  `Indicative architectural concept visualization, realistic rendering. ${COMMON} Client wishes: "${wishesEn || 'none'}"`;

// images: [{ mime, data: Buffer }] → { data: Buffer, mime, model }
async function cloudflareImage(images, kind, wishes, timeout = GEMINI_TIMEOUT) {
  if (!configured()) throw coded('viz_off', 'Lipsesc CF_ACCOUNT_ID / CF_AI_TOKEN');
  const deadline = Date.now() + timeout;
  const left = () => deadline - Date.now();
  const model = cfModel();
  const en = await toEnglish(wishes, Math.min(8000, Math.max(1000, timeout - 30000)));
  if (left() < 5000) throw coded('timeout', 'Nu a mai rămas timp pentru generare');
  let r;
  // Pozele vin deja micșorate din browser (maxSide); una mai mare (pagină veche din cache) ar fi refuzată de model
  const big = images.map(i => imageSize(i.data)).find(s => s && Math.max(s.w, s.h) > maxSide());
  if (big) throw coded('service', `Poza are ${big.w}×${big.h} px, peste ${maxSide()} px cât primește modelul ${model}`);
  if (isFlux2(model)) {
    // FLUX.2: totul ca multipart; pozele ca input_image_0…3 (cel mult 4, fiecare sub 512×512, micșorate în browser)
    const form = new FormData();
    const { width, height } = outputSize(imageSize(images[0].data));
    form.append('prompt', cfPrompt(kind, en, images.length));
    form.append('width', String(width));
    form.append('height', String(height));
    images.slice(0, 4).forEach((img, i) => form.append(`input_image_${i}`, new Blob([img.data], { type: img.mime }), `input-${i}.${EXT[img.mime] || 'jpg'}`));
    r = await cfRun(model, { body: form }, left());
  } else {
    // Modelele img2img mai vechi (Stable Diffusion): o singură poză, ca listă de octeți, plus cât de mult se poate schimba
    r = await cfRun(model, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: cfPrompt(kind, en, 1), image: [...images[0].data], strength: 0.6, num_steps: 20, guidance: 7.5 }),
    }, left());
  }
  const type = r.headers.get('content-type') || '';
  if (r.ok && /^image\//.test(type)) {
    const data = Buffer.from(await r.arrayBuffer());
    return { data, mime: sniff(data), model };
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.success === false) throw cfError(r.status, data);
  const b64 = (data.result && data.result.image) || data.image;
  if (!b64) throw coded('service', 'Cloudflare nu a întors nicio imagine');
  const buf = Buffer.from(b64, 'base64');
  return { data: buf, mime: sniff(buf), model };
}

// Stratul comun: furnizorul ales prin IMAGE_PROVIDER
async function generateImage(images, kind, wishes, timeout = GEMINI_TIMEOUT) {
  if (provider() === 'gemini') return geminiImage(images, buildPrompt(kind, wishes), timeout);
  return cloudflareImage(images, kind, wishes, timeout);
}

/* ---------- Generarea completă ---------- */
let notifyMod = null;
const notify = () => (notifyMod = notifyMod || require('./notify'));

// Alerta (facturare, cotă, token greșit): cel mult o dată pe zi, în chatul proprietarului
async function billingAlert(text) {
  try {
    if (await countHits('viz-billing-alert', 864e5) > 0) return;
    await addHit('viz-billing-alert');
    await notify().sendTelegram(`⚠️ <b>Generarea imaginilor nu merge:</b> ${String(text).replace(/[<>&]/g, '')}.`);
  } catch (e) {
    console.error('Alerta de facturare nu s-a trimis:', e.message);
  }
}

const fail = (row, status, error) => rest(`generations?id=eq.${row.id}`, {
  method: 'PATCH',
  body: { status, error: error.slice(0, 300) },
  prefer: 'return=minimal',
}).catch(e => console.error('Starea generării nu s-a salvat:', e.message));

/* row = rândul deja revendicat (claim), files = tmpFiles(token).files, started = începutul cererii (ms).
   Întoarce { status: 'done', row, model } | { status: 'rejected' } | { status: 'failed', code: 'timeout' | 'service', detail } */
async function run(row, files, started = Date.now()) {
  let images;
  try {
    images = await Promise.all(files.map(async f => ({ mime: f.mime, data: await store.download(`${tmpDir(row.token)}/${f.name}`) })));
  } catch (e) {
    console.error('Pozele nu s-au putut descărca:', e.message);
    await fail(row, 'failed', `storage: ${e.message}`);
    return { status: 'failed', code: 'service', detail: 'storage' };
  }

  let out;
  try {
    // Furnizorul primește cel mult 50 s și cât rămâne din cele 60 ale funcției (cu ~6 s pentru Storage și baza de date)
    out = await generateImage(images, row.kind, row.wishes, Math.min(GEMINI_TIMEOUT, 54000 - (Date.now() - started)));
  } catch (e) {
    console.error(`Generarea (${provider()}) a eșuat:`, e.message);
    if (e.code === 'rejected') {
      await fail(row, 'rejected', e.message);
      await dropTmp(row.token);
      return { status: 'rejected' };
    }
    await fail(row, 'failed', e.message);
    if (e.alert) await billingAlert(e.alert);
    // Limita zilnică a furnizorului: tot „failed” (nu se numără), dar cu mesajul ei
    return { status: 'failed', code: ['timeout', 'quota'].includes(e.code) ? e.code : 'service', detail: e.message.slice(0, 300) };
  }

  // Schița și pozele de intrare stau împreună în viz/<id>/; o problemă la Storage = „failed”, nu se numără
  try {
    const output = `viz/${row.id}/output.${EXT[out.mime]}`;
    await store.upload(output, out.data, out.mime);
    const inputs = [];
    for (const f of files) {
      const to = `viz/${row.id}/input-${f.page}.${f.name.split('.')[1]}`;
      await store.move(`${tmpDir(row.token)}/${f.name}`, to);
      inputs.push(to);
    }
    const [done] = await rest(`generations?id=eq.${row.id}`, {
      method: 'PATCH',
      body: { status: 'done', error: '', model: out.model, output_path: output, input_paths: inputs },
      prefer: 'return=representation',
    });
    return { status: 'done', row: done, model: out.model };
  } catch (e) {
    console.error('Salvarea schiței a eșuat:', e.message);
    await fail(row, 'failed', `storage: ${e.message}`);
    return { status: 'failed', code: 'service', detail: 'storage' };
  }
}

/* ---------- Curățenia și ștergerea ---------- */
/* Rezervările expirate (15 minute): pozele din tmp/ se șterg, „pending” devine „failed” (nu se mai numără).
   Fiecare rând e revendicat atomic (token=eq.<token>), deci două curățenii simultane nu fac același lucru de două ori.
   onPublicExpired(row) primește rezervările publice care nu au ajuns la o schiță (anunțul pe Telegram). */
async function sweep(onPublicExpired, now = Date.now()) {
  const nowIso = encodeURIComponent(new Date(now).toISOString());
  const rows = await rest(`generations?select=id,token,status,origin,request_id&token=not.is.null&status=in.(pending,failed)&token_expires_at=lt.${nowIso}&limit=20`);
  for (const r of rows) {
    const body = r.status === 'pending' ? { token: null, status: 'failed', error: 'expirat' } : { token: null };
    const [claimed] = await rest(`generations?id=eq.${r.id}&token=eq.${encodeURIComponent(r.token)}`, { method: 'PATCH', body, prefer: 'return=representation' });
    if (!claimed) continue;
    await dropTmp(r.token);
    if (r.status === 'pending' && r.origin === 'public' && onPublicExpired) await onPublicExpired(r).catch(e => console.error('Anunțul rezervării expirate a eșuat:', e.message));
  }
}

// Toate fișierele unei generări: schița, pozele mutate și (dacă mai există) cele din tmp/
async function filesOf(row) {
  const paths = [row.output_path, ...(row.input_paths || [])].filter(Boolean);
  if (row.token) (await store.list(tmpDir(row.token)).catch(() => [])).filter(f => f.id).forEach(f => paths.push(`${tmpDir(row.token)}/${f.name}`));
  return paths;
}

async function removeGeneration(row) {
  await store.remove(await filesOf(row));
  await rest(`generations?id=eq.${row.id}`, { method: 'DELETE' });
}

// Fișierele tuturor generărilor unei cereri (ștergerea clientului din CRM)
async function filesOfRequest(requestId) {
  const rows = await rest(`generations?select=output_path,input_paths,token&request_id=eq.${requestId}`).catch(() => []);
  const out = [];
  for (const r of rows) out.push(...await filesOf(r));
  return out;
}

module.exports = {
  PUBLIC_PER_IP_DAY, PUBLIC_PER_PHONE, SITE_PER_DAY, TEAM_PER_DAY, TRIES_PER_HOUR, RESERVE_MS, MAX_FILES, MAX_FILE, MAX_WISHES,
  KINDS, EXT, configured, provider, maxSide, modelName, models, buildPrompt, cfPrompt, imageSize, outputSize, dayStart, normPhone,
  publicLimit, teamUsed, teamLimit, tryHit, validFiles, tmpFiles, dropTmp, reserve, findByToken, isExpired, claim,
  generateImage, geminiImage, cloudflareImage, parseResponse, run, sweep, removeGeneration, filesOfRequest,
};
