/* ==========================================================
   POST /api/contact — primește cererea din formular.
   Etapa 2: o salvează în Supabase, apoi anunță proprietarul pe Telegram
   (și pe email, dacă Resend e configurat). Cât timp Supabase nu e
   configurat, merge ca în Etapa 1: doar Telegram.
   ========================================================== */
const { TYPES, SERVICES } = require('./_lib/labels');
const { rest } = require('./_lib/db');
const { ipKey, jsonBody, allow } = require('./_lib/http');
const { countHits, addHit } = require('./_lib/rate');
const { telegramText, sendTelegram, sendOwnerEmail, emailConfigured } = require('./_lib/notify');

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

module.exports = handler;
module.exports.validate = validate;
module.exports.isSpam = isSpam;
