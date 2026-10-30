/* Notificări către proprietar: Telegram și (opțional) email prin Resend.
   Variabile: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
              RESEND_API_KEY, OWNER_EMAIL, MAIL_FROM (emailul e sărit dacă lipsesc) */
const { TYPES, SERVICES } = require('./labels');

// SITE_URL se setează în Vercel după redenumirea proiectului (ex. https://luxarch.vercel.app)
const SITE = (process.env.SITE_URL || 'https://atelier-temelia.vercel.app').replace(/\/$/, '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const when = d => new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', dateStyle: 'short', timeStyle: 'short' });

// Rândurile comune, deja „escape”-uite pentru HTML
function rows(d) {
  return [
    ['Nume', esc(d.name)],
    ['Telefon', esc(d.phone)],
    ['Email', esc(d.email)],
    ['Tip proiect', TYPES[d.type] || esc(d.type)],
    ['Servicii', SERVICES[d.service] || esc(d.service)],
    ['Despre proiect', d.message ? esc(d.message) : '—'],
  ];
}

function telegramText(d, createdAt = new Date(), adminLink = false) {
  const lines = [
    '<b>🏠 Cerere nouă de pe site</b>',
    '',
    ...rows(d).map(([k, v]) => `<b>${k}:</b> ${v}`),
    '',
    `<i>Limba: ${d.lang.toUpperCase()} · ${when(createdAt)} (ora Chișinăului)</i>`,
  ];
  if (adminLink) lines.push('', `<a href="${SITE}/admin">Deschide în panoul de administrare</a>`);
  return lines.join('\n');
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

const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.OWNER_EMAIL && process.env.MAIL_FROM);

async function sendOwnerEmail(d, createdAt = new Date()) {
  const html = `
    <h2 style="font-family:Georgia,serif;font-weight:400">Cerere nouă de pe site</h2>
    <table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">
      ${rows(d).map(([k, v]) => `<tr><td style="color:#5E534A;vertical-align:top"><b>${k}</b></td><td style="white-space:pre-wrap">${v}</td></tr>`).join('')}
    </table>
    <p style="font-family:Arial,sans-serif;font-size:13px;color:#5E534A">Limba: ${d.lang.toUpperCase()} · ${when(createdAt)} (ora Chișinăului)</p>
    <p style="font-family:Arial,sans-serif"><a href="${SITE}/admin">Deschide în panoul de administrare</a></p>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [process.env.OWNER_EMAIL],
      reply_to: d.email,
      subject: `Cerere nouă: ${d.name} (${TYPES[d.type] || d.type})`,
      html,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

module.exports = { telegramText, sendTelegram, sendOwnerEmail, emailConfigured };
