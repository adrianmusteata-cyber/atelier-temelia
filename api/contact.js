/* ==========================================================
   POST /api/contact — primește cererea din formular.
   Etapa 2: o salvează în Supabase, apoi anunță proprietarul pe Telegram
   (și pe email, dacă Resend e configurat). Cât timp Supabase nu e
   configurat, merge ca în Etapa 1: doar Telegram.
   Vizualizare proiect (schiță generată de Cloudflare Workers AI sau Gemini, vezi _lib/imagegen.js), cu ?action=:
   GET  /api/contact?action=viz-status → { enabled, site_key, max_side } — pagina arată formularul doar dacă totul e configurat
   POST /api/contact?action=viz-start { kind, wishes, name, phone, email?, consent, turnstile, files: [{ page, mime, size }],
        website, startedAt, lang } → { token, uploads: [{ page, url }] } — cererea se salvează în CRM înainte de limite;
        o limită atinsă → 429 { error: limit_ip | limit_phone | limit_site, saved: true }
   POST /api/contact?action=viz-generate { token } → { url } (link de citire valabil o oră)
   Fără action, ruta e formularul de contact de mai jos, neschimbat.
   ========================================================== */
const { TYPES, SERVICES } = require('./_lib/labels');
const { rest } = require('./_lib/db');
const { ipKey, clientIp, jsonBody, allow } = require('./_lib/http');
const { countHits, addHit } = require('./_lib/rate');
const { telegramText, vizText, sendTelegram, sendOwnerEmail, emailConfigured, notifySafely } = require('./_lib/notify');
const viz = require('./_lib/imagegen');
const turnstile = require('./_lib/turnstile');
const store = require('./_lib/storage');

const LIMITS = { name: 100, phone: 30, email: 150, message: 3000 };
const MIN_FILL_MS = 3000;
const MAX_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = v => (typeof v === 'string' ? v.trim() : '');
const dbConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Întoarce { data } sau { errors: [câmpuri greșite] }
function validate(body) {
  const data = {
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    type: str(body.type),
    service: str(body.service),
    message: str(body.message),
    lang: ['ro', 'ru', 'en'].includes(body.lang) ? body.lang : 'ro',
  };
  const errors = [];
  for (const f of ['name', 'phone', 'email', 'message']) if (!data[f]) errors.push(f);
  if (data.message && data.message.length < 3) errors.push('message');
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('email');
  for (const [f, max] of Object.entries(LIMITS)) if (data[f].length > max) errors.push(f);
  if (!TYPES[data.type]) errors.push('type');
  if (!SERVICES[data.service]) errors.push('service');
  if (body.consent !== true) errors.push('consent');
  return errors.length ? { errors: [...new Set(errors)] } : { data };
}

// Câmpul-capcană completat sau formular trimis prea repede
function isSpam(body, now = Date.now()) {
  if (str(body.website)) return true;
  const started = Number(body.startedAt);
  return !Number.isFinite(started) || now - started < MIN_FILL_MS;
}

async function handler(req, res) {
  // Vizualizare proiect: doar cu ?action=; fără el, formularul de contact merge exact ca înainte
  const action = String((req.query && req.query.action) || '');
  if (action) return vizHandler(action, req, res);
  if (!allow(req, res, ['POST'])) return;
  const body = jsonBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'invalid', fields: [] });

  // Roboții văd „succes”, dar nu se trimite și nu se salvează nimic
  if (isSpam(body)) return res.status(200).json({ ok: true });

  const { data, errors } = validate(body);
  if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  // Etapa 1 (fără bază de date): Telegram e singurul canal
  if (!dbConfigured()) {
    try {
      await sendTelegram(telegramText(data));
    } catch (e) {
      console.error('Trimiterea pe Telegram a eșuat:', e.message);
      return res.status(502).json({ ok: false, error: 'send' });
    }
    return res.status(200).json({ ok: true });
  }

  // Etapa 2: întâi salvăm
  let saved;
  try {
    const key = ipKey('contact', req);
    if (await countHits(key, 36e5) >= MAX_PER_HOUR) return res.status(429).json({ ok: false, error: 'rate' });
    await addHit(key);
    [saved] = await rest('requests', { method: 'POST', body: data, prefer: 'return=representation' });
  } catch (e) {
    // Baza de date nu răspunde: cererea pleacă totuși pe Telegram, ca să nu se piardă.
    // Vizitatorul vede eroare (cu WhatsApp) doar dacă nici Telegram nu merge.
    console.error('Salvarea în Supabase a eșuat:', e.message);
    try {
      await sendTelegram(telegramText(data) + '\n\n⚠️ <i>Cererea NU a fost salvată în panou (eroare la baza de date).</i>');
      return res.status(200).json({ ok: true });
    } catch (e2) {
      console.error('Trimiterea pe Telegram a eșuat:', e2.message);
      return res.status(502).json({ ok: false, error: 'save' });
    }
  }

  // Notificările nu mai pot pierde cererea: doar le scriem în log dacă eșuează
  const jobs = [sendTelegram(telegramText(data, saved.created_at, true))];
  if (emailConfigured()) jobs.push(sendOwnerEmail(data, saved.created_at));
  (await Promise.allSettled(jobs)).forEach(r => {
    if (r.status === 'rejected') console.error('Notificarea a eșuat:', r.reason?.message);
  });
  return res.status(200).json({ ok: true });
}

/* ==========================================================
   Vizualizare proiect (partea publică)
   ========================================================== */
const VIZ_LIMITS = { name: 100, phone: 30, email: 150 };
const VIZ_START_PER_HOUR = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIZ_READ_SECONDS = 3600; // linkul schiței pentru vizitator: o oră

// Totul trebuie să existe: cheile furnizorului de imagini, ambele chei Turnstile și baza de date (altfel pe site rămâne formularul obișnuit)
const vizEnabled = () => viz.configured() && turnstile.configured() && dbConfigured();

// Motivul din anunțul de pe Telegram, când schița nu s-a generat
const NOT_GENERATED = {
  limit_ip: 'vizitatorul a folosit azi cele 2 vizualizări',
  limit_phone: 'pentru acest număr s-au făcut deja 3 vizualizări',
  limit_site: 'plafonul zilnic al site-ului (20) e atins',
  rejected: 'Google a refuzat poza (filtrul de siguranță)',
  timeout: 'generarea a durat prea mult',
  service: 'serviciul de imagini nu a răspuns',
  quota: 'limita gratuită zilnică a serviciului de imagini e atinsă',
  expired: 'pozele nu au fost încărcate (pagina a fost închisă)',
  reserve: 'eroare la pregătirea generării',
};

// Întoarce { data, files } sau { errors: [câmpuri greșite] }
function validateViz(body) {
  const data = {
    kind: str(body.kind),
    wishes: str(body.wishes),
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    lang: ['ro', 'ru', 'en'].includes(body.lang) ? body.lang : 'ro',
  };
  const errors = [];
  if (!viz.KINDS[data.kind]) errors.push('kind');
  if (!data.name) errors.push('name');
  // Telefonul e obligatoriu și e cheia limitei: cel puțin 6 cifre după normalizare
  if (!data.phone || viz.normPhone(data.phone).length < 6) errors.push('phone');
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('email');
  for (const [f, max] of Object.entries(VIZ_LIMITS)) if (data[f].length > max) errors.push(f);
  if (data.wishes.length > viz.MAX_WISHES) errors.push('wishes');
  if (body.consent !== true) errors.push('consent');
  if (!viz.validFiles(body.files)) errors.push('files');
  return errors.length ? { errors: [...new Set(errors)] } : { data, files: body.files };
}

// Cererea din CRM: Interior = design interior; casă nouă și fațadă = casă unifamilială
const vizRequestRow = d => ({
  name: d.name,
  phone: d.phone,
  email: d.email || '',
  type: d.kind === 'interior' ? 'altceva' : 'casa',
  service: d.kind === 'interior' ? 'design' : 'nu_stiu',
  message: `Vizualizare: ${viz.KINDS[d.kind]}. Dorințe: ${d.wishes || '—'}`,
  lang: d.lang,
  status: 'noua',
  source: 'vizualizare',
});

// Același telefon, aceeași zi (ora Moldovei), sursa „vizualizare”: generarea se leagă de cererea existentă
async function todayVizRequest(phoneKey) {
  const rows = await rest(`requests?select=*&source=eq.vizualizare&created_at=gte.${encodeURIComponent(viz.dayStart())}&order=created_at.desc&limit=500`);
  return rows.find(r => viz.normPhone(r.phone) === phoneKey) || null;
}

const announce = (request, why) => notifySafely([sendTelegram(vizText(request, why))]);
const notGenerated = code => `nu s-a generat: ${NOT_GENERATED[code] || code}`;

// Rezervările abandonate (vizitatorul a închis pagina înainte de generare): cererea primește totuși anunțul
async function onExpired(row) {
  if (!row.request_id) return;
  const [request] = await rest(`requests?select=*&id=eq.${row.request_id}`);
  if (request) await announce(request, notGenerated('expired'));
}
const maybeSweep = () => (Math.random() < 0.2 ? viz.sweep(onExpired).catch(e => console.error('Curățarea vizualizărilor a eșuat:', e.message)) : null);

async function vizStatus(res) {
  res.setHeader('Cache-Control', 'no-store');
  const enabled = vizEnabled();
  if (enabled) await maybeSweep();
  // max_side: latura mare la care browserul micșorează pozele (modelul Cloudflare primește doar poze sub 512 px)
  return res.status(200).json({ ok: true, enabled, site_key: enabled ? turnstile.siteKey() : '', max_side: viz.maxSide() });
}

async function vizStart(req, res, body) {
  // 1. Roboții primesc „succes” fals: nimic salvat, nicio generare
  if (isSpam(body)) return res.status(200).json({ ok: true });
  if (!vizEnabled()) return res.status(503).json({ ok: false, error: 'viz_off' });
  // 2. Câmpurile
  const { data, files, errors } = validateViz(body);
  if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
  // 3. Turnstile la Cloudflare: fără verificare nu se salvează nimic
  if (!(await turnstile.verifyTurnstile(body.turnstile, clientIp(req)))) return res.status(403).json({ ok: false, error: 'turnstile' });

  const row = vizRequestRow(data);
  const ipk = ipKey('viz', req);
  const phoneKey = viz.normPhone(data.phone);
  let request;
  try {
    // 4. Cel mult 5 apeluri „start” pe oră de pe același IP
    const key = ipKey('viz-start', req);
    if (await countHits(key, 36e5) >= VIZ_START_PER_HOUR) return res.status(429).json({ ok: false, error: 'rate' });
    await addHit(key);
    // 5. Cererea în CRM, indiferent dacă urmează sau nu generarea
    request = await todayVizRequest(phoneKey);
    if (!request) [request] = await rest('requests', { method: 'POST', body: row, prefer: 'return=representation' });
  } catch (e) {
    // Baza de date nu răspunde: cererea pleacă pe Telegram, ca să nu se piardă; fără generare
    console.error('Salvarea cererii de vizualizare a eșuat:', e.message);
    try {
      await sendTelegram(vizText(row, 'nu s-a generat: baza de date nu răspunde') + '\n\n⚠️ <i>Cererea NU a fost salvată în panou (eroare la baza de date).</i>');
      return res.status(502).json({ ok: false, error: 'db_down' });
    } catch (e2) {
      console.error('Trimiterea pe Telegram a eșuat:', e2.message);
      return res.status(502).json({ ok: false, error: 'save' });
    }
  }

  try {
    // 6. Limitele de generare; cererea e deja salvată, iar anunțul pleacă oricum
    const limit = await viz.publicLimit({ ipKey: ipk, phoneKey });
    if (limit) {
      await announce(request, notGenerated(limit));
      return res.status(429).json({ ok: false, error: limit, saved: true });
    }
    // 7. Rezervarea (rândul „pending” se numără deja) și linkurile de încărcare
    const r = await viz.reserve({
      origin: 'public', kind: data.kind, wishes: data.wishes, request_id: request.id,
      actor: '', actor_key: ipk, phone_key: phoneKey, files,
    });
    await maybeSweep();
    return res.status(200).json({ ok: true, token: r.token, uploads: r.uploads, max_side: viz.maxSide() });
  } catch (e) {
    console.error('Rezervarea vizualizării a eșuat:', e.message);
    await announce(request, notGenerated('reserve'));
    return res.status(502).json({ ok: false, error: 'service', saved: true });
  }
}

async function vizGenerate(req, res, body) {
  const started = Date.now();
  if (!vizEnabled()) return res.status(503).json({ ok: false, error: 'viz_off' });
  const token = String(body.token || '');
  if (!UUID_RE.test(token)) return res.status(400).json({ ok: false, error: 'token' });
  const row = await viz.findByToken(token);
  if (!row || row.origin !== 'public') return res.status(404).json({ ok: false, error: 'notfound' });
  // Dublu clic după o reușită: aceeași schiță, fără o generare nouă
  if (row.status === 'done') return res.status(200).json({ ok: true, url: await store.signRead(row.output_path, VIZ_READ_SECONDS) });
  if (row.status === 'rejected') return res.status(422).json({ ok: false, error: 'rejected' });
  if (viz.isExpired(row)) return res.status(410).json({ ok: false, error: 'expired' });
  if (row.status === 'pending' && row.started_at) return res.status(409).json({ ok: false, error: 'busy' });
  // Încercările (anti-buclă): 10 pe oră de pe același IP, reușite sau nu
  if (!(await viz.tryHit(ipKey('viz', req)))) return res.status(429).json({ ok: false, error: 'limit_tries' });

  const { files, error } = await viz.tmpFiles(token);
  if (error) return res.status(400).json({ ok: false, error: 'files' });
  if (!files.length) return res.status(409).json({ ok: false, error: 'nofiles' });
  // O încercare nouă după un eșec: rândul „failed” nu se număra, deci limitele se verifică din nou
  if (row.status === 'failed') {
    const limit = await viz.publicLimit({ ipKey: row.actor_key, phoneKey: row.phone_key });
    if (limit) return res.status(429).json({ ok: false, error: limit, saved: true });
  }
  const claimed = await viz.claim(row);
  if (!claimed) return res.status(409).json({ ok: false, error: 'busy' });

  // Generarea continuă pe server și dacă vizitatorul închide pagina: schița ajunge pe fișă
  const out = await viz.run(claimed, files, started);
  const [request] = row.request_id ? await rest(`requests?select=*&id=eq.${row.request_id}`).catch(() => []) : [];
  if (request) await announce(request, out.status === 'done' ? 'schița e pe fișă' : notGenerated(out.status === 'rejected' ? 'rejected' : out.code));

  if (out.status === 'done') {
    return res.status(200).json({ ok: true, url: await store.signRead(out.row.output_path, VIZ_READ_SECONDS) });
  }
  if (out.status === 'rejected') return res.status(422).json({ ok: false, error: 'rejected' });
  // Limita zilnică a furnizorului nu se numără: vizitatorul află că azi nu mai merge, cererea e salvată
  return res.status(out.code === 'timeout' ? 504 : out.code === 'quota' ? 503 : 502).json({ ok: false, error: out.code });
}

async function vizHandler(action, req, res) {
  const routes = { 'viz-status': 'GET', 'viz-start': 'POST', 'viz-generate': 'POST' };
  if (!routes[action]) return res.status(404).json({ ok: false, error: 'notfound' });
  if (!allow(req, res, [routes[action]])) return;
  try {
    if (action === 'viz-status') return await vizStatus(res);
    const body = jsonBody(req);
    if (!body) return res.status(400).json({ ok: false, error: 'invalid', fields: [] });
    if (action === 'viz-start') return await vizStart(req, res, body);
    return await vizGenerate(req, res, body);
  } catch (e) {
    console.error(`Vizualizarea (${action}) a eșuat:`, e.message);
    return res.status(502).json({ ok: false, error: 'service' });
  }
}

module.exports = handler;
module.exports.validateViz = validateViz;
module.exports.validate = validate;
module.exports.isSpam = isSpam;
