/* ==========================================================
   POST /api/contact — primește cererea din formular și o trimite pe Telegram.
   Secretele stau doar în variabilele de mediu Vercel:
   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
   ========================================================== */

const TYPES = {
  casa: 'Casă unifamilială',
  ansamblu: 'Ansamblu rezidențial',
  birouri: 'Clădire de birouri / comercială',
  hala: 'Hală / industrial',
  expertiza: 'Expertiză / consolidare',
  altceva: 'Altceva',
};
const SERVICES = {
  arh_rez: 'Arhitectură + Rezistență',
  arh: 'Doar arhitectură',
  rez: 'Doar rezistență',
  nu_stiu: 'Nu știu încă',
};
const LIMITS = { name: 100, phone: 30, email: 150, message: 3000 };
const MIN_FILL_MS = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = v => (typeof v === 'string' ? v.trim() : '');

// Întoarce { data } sau { errors: [câmpuri greșite] }
function validate(body) {
  const data = {
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    type: str(body.type),
    service: str(body.service),
    message: str(body.message),
    lang: body.lang === 'en' ? 'en' : 'ro',
  };
  const errors = [];
  for (const f of ['name', 'phone', 'email']) if (!data[f]) errors.push(f);
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

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function telegramText(d, now = new Date()) {
  const when = now.toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', dateStyle: 'short', timeStyle: 'short' });
  return [
    '<b>🏠 Cerere nouă de pe site</b>',
    '',
    `<b>Nume:</b> ${esc(d.name)}`,
    `<b>Telefon:</b> ${esc(d.phone)}`,
    `<b>Email:</b> ${esc(d.email)}`,
    `<b>Tip proiect:</b> ${TYPES[d.type]}`,
    `<b>Servicii:</b> ${SERVICES[d.service]}`,
    `<b>Despre proiect:</b> ${d.message ? esc(d.message) : '—'}`,
    '',
    `<i>Limba: ${d.lang.toUpperCase()} · ${when} (ora Chișinăului)</i>`,
  ].join('\n');
}

async function sendTelegram(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  if (!token || !chatId) throw new Error('Lipsesc TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'invalid', fields: [] });

  // Roboții văd „succes”, dar nu se trimite nimic
  if (isSpam(body)) return res.status(200).json({ ok: true });

  const { data, errors } = validate(body);
  if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  try {
    await sendTelegram(telegramText(data));
  } catch (e) {
    console.error('Trimiterea pe Telegram a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'send' });
  }
  return res.status(200).json({ ok: true });
}

module.exports = handler;
module.exports.validate = validate;
module.exports.isSpam = isSpam;
module.exports.telegramText = telegramText;
