/* GET  /api/admin/requests?status=<status|toate>&cursor=<created_at>
        Lista cererilor, cele mai noi primele, câte 50, plus numărul pe fiecare status.
   GET  /api/admin/requests?all=1 — toți clienții deodată, pentru tabla pâlniei (maximum 1000).
   POST /api/admin/requests { name, phone, channel, email?, type?, service?, status?, notes? }
        — client adăugat manual, cu sursa „manual” și canalul „apel” sau „intalnire”. */
const { rest } = require('../../_lib/db');
const { allow, jsonBody } = require('../../_lib/http');
const { requireAdmin } = require('../../_lib/auth');
const { TYPES, SERVICES, STATUSES, CHANNELS } = require('../../_lib/labels');
const { receivablesWithState } = require('../../_lib/dues');
const { manualClientText, paymentText, isPayment, sendTelegram, sendPayment, notifySafely } = require('../../_lib/notify');

const PAGE = 50;
const BOARD_MAX = 1000;
const FIELDS = 'id,created_at,name,phone,email,type,service,status,source,channel,status_updated_at,contract_value,currency,payments(amount)';
const LIMITS = { name: 100, phone: 30, email: 150, notes: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = v => (typeof v === 'string' ? v.trim() : '');

// Întoarce { data } sau { errors: [câmpuri greșite] }. Obligatorii: doar numele și telefonul.
function validateManual(body) {
  const data = {
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    type: str(body.type),
    service: str(body.service),
    notes: str(body.notes),
    status: str(body.status) || 'noua',
    source: 'manual',
    channel: str(body.channel),
  };
  const errors = [];
  if (!data.name) errors.push('name');
  if (!data.phone) errors.push('phone');
  if (!CHANNELS[data.channel]) errors.push('channel');
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('email');
  for (const [f, max] of Object.entries(LIMITS)) if (data[f].length > max) errors.push(f);
  if (data.type && !TYPES[data.type]) errors.push('type');
  if (data.service && !SERVICES[data.service]) errors.push('service');
  // „Respins” cere motiv: se alege abia după creare, din fișa clientului
  if (!STATUSES[data.status] || data.status === 'respins') errors.push('status');
  return errors.length ? { errors: [...new Set(errors)] } : { data };
}

// Plățile vin împreună cu clientul; în browser trimitem doar totalul lor
const withTotals = items => items.map(({ payments, ...r }) => ({
  ...r,
  paid_total: Math.round((payments || []).reduce((s, p) => s + Number(p.amount), 0) * 100) / 100,
}));

async function list(req, res) {
  if (req.query.all) {
    const [items, recs] = await Promise.all([
      rest(`requests?select=${FIELDS}&order=created_at.desc&limit=${BOARD_MAX}`),
      receivablesWithState().catch(() => []),
    ]);
    // Clienții cu cel puțin o rată de încasat restantă primesc eticheta „Restant” pe tablă
    const overdue = new Set(recs.filter(r => r.state === 'overdue').map(r => r.request_id));
    return res.status(200).json({ ok: true, items: withTotals(items).map(r => ({ ...r, overdue: overdue.has(r.id) })) });
  }

  const status = STATUSES[req.query.status] ? req.query.status : 'toate';
  const cursor = typeof req.query.cursor === 'string' && !isNaN(Date.parse(req.query.cursor)) ? req.query.cursor : null;

  let q = `requests?select=${FIELDS}&order=created_at.desc&limit=${PAGE + 1}`;
  if (status !== 'toate') q += `&status=eq.${status}`;
  if (cursor) q += `&created_at=lt.${encodeURIComponent(cursor)}`;

  const [items, all] = await Promise.all([rest(q), rest('requests?select=status')]);
  const counts = { toate: all.length };
  Object.keys(STATUSES).forEach(s => { counts[s] = 0; });
  all.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const more = items.length > PAGE;
  const page = withTotals(items.slice(0, PAGE));
  return res.status(200).json({
    ok: true,
    items: page,
    counts,
    nextCursor: more ? page[page.length - 1].created_at : null,
  });
}

async function create(req, res) {
  const { data, errors } = validateManual(jsonBody(req) || {});
  if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
  const [item] = await rest('requests', { method: 'POST', body: data, prefer: 'return=representation' });
  // Telegram: clientul nou în chatul principal; dacă e creat direct ca Avans/Plătit, și în „Achitări”
  const jobs = [sendTelegram(manualClientText(item))];
  if (isPayment(item.status)) jobs.push(sendPayment(paymentText(item)));
  await notifySafely(jobs);
  return res.status(201).json({ ok: true, item });
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;
  try {
    return await (req.method === 'POST' ? create(req, res) : list(req, res));
  } catch (e) {
    console.error('Operația pe clienți a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db' });
  }
};
module.exports.validateManual = validateManual;
