/* Notificări către proprietar: Telegram și (opțional) email prin Resend.
   Variabile: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
              TELEGRAM_PAYMENTS_CHAT_ID (chatul „Achitări”; dacă lipsește, plățile merg în TELEGRAM_CHAT_ID),
              RESEND_API_KEY, OWNER_EMAIL, MAIL_FROM (emailul e sărit dacă lipsesc) */
const { TYPES, SERVICES, STATUSES, CHANNELS } = require('./labels');

// Adresa publică a site-ului (linkurile din Telegram/email); se poate suprascrie cu SITE_URL în Vercel
const SITE = (process.env.SITE_URL || 'https://luxarch.vercel.app').replace(/\/$/, '');
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

// Client adăugat manual din panou
function manualClientText(r) {
  const lines = [
    '<b>📝 Client nou adăugat manual</b>',
    '',
    `<b>Nume:</b> ${esc(r.name)}`,
    `<b>Telefon:</b> ${esc(r.phone)}`,
    `<b>A venit prin:</b> ${CHANNELS[r.channel] || '—'}`,
  ];
  if (r.email) lines.push(`<b>Email:</b> ${esc(r.email)}`);
  if (r.type) lines.push(`<b>Tip proiect:</b> ${TYPES[r.type] || esc(r.type)}`);
  if (r.service) lines.push(`<b>Servicii:</b> ${SERVICES[r.service] || esc(r.service)}`);
  lines.push(`<b>Etapă:</b> ${STATUSES[r.status] || esc(r.status)}`);
  if (r.notes) lines.push(`<b>Note:</b> ${esc(r.notes)}`);
  lines.push('', `<i>${when(r.created_at || new Date())} (ora Chișinăului)</i>`, '', `<a href="${SITE}/admin?id=${r.id}">Deschide fișa clientului</a>`);
  return lines.join('\n');
}

// Plată: „avans” = plată parțială, „platit” = achitare totală. Titlurile diferă ca să se vadă dintr-o privire.
const PAYMENT_TITLES = {
  avans: '<b>💰 AVANS PRIMIT</b>\n<i>Plată parțială — proiectul nu e achitat integral</i>',
  platit: '<b>✅ ACHITARE TOTALĂ</b>\n<i>Proiectul e achitat integral</i>',
};
const isPayment = status => status in PAYMENT_TITLES;

const money = (n, cur) => `${Number(n).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${cur || 'MDL'}`;

// paid = suma plăților înregistrate în fișă (null dacă nu se știe)
function paymentText(r, paid = null) {
  const lines = [
    PAYMENT_TITLES[r.status],
    '',
    `<b>Client:</b> ${esc(r.name)}`,
    `<b>Telefon:</b> ${esc(r.phone)}`,
  ];
  if (r.contract_value != null) lines.push(`<b>Valoare contract:</b> ${money(r.contract_value, r.currency)}`);
  if (paid != null && paid > 0) lines.push(`<b>Achitat până acum:</b> ${money(paid, r.currency)}`);
  if (r.contract_value != null && paid != null) lines.push(`<b>Rămas de achitat:</b> ${money(Math.max(0, r.contract_value - paid), r.currency)}`);
  if (r.type) lines.push(`<b>Tip proiect:</b> ${TYPES[r.type] || esc(r.type)}`);
  if (r.service) lines.push(`<b>Servicii:</b> ${SERVICES[r.service] || esc(r.service)}`);
  lines.push('', `<i>${when(r.status_updated_at || new Date())} (ora Chișinăului)</i>`, '', `<a href="${SITE}/admin?id=${r.id}">Deschide fișa clientului</a>`);
  return lines.join('\n');
}

async function sendTelegram(text, chatId = process.env.TELEGRAM_CHAT_ID) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) throw new Error('Lipsesc TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

const sendPayment = text => sendTelegram(text, process.env.TELEGRAM_PAYMENTS_CHAT_ID || process.env.TELEGRAM_CHAT_ID);

// Notificările din panou nu au voie să strice salvarea: doar se scriu în log dacă eșuează
async function notifySafely(jobs) {
  (await Promise.allSettled(jobs)).forEach(r => {
    if (r.status === 'rejected') console.error('Notificarea a eșuat:', r.reason?.message);
  });
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

module.exports = {
  telegramText, sendTelegram, sendOwnerEmail, emailConfigured,
  manualClientText, paymentText, isPayment, sendPayment, notifySafely,
};
