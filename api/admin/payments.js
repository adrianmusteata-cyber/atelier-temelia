/* POST   /api/admin/payments { request_id, paid_on, amount, note? } — adaugă o plată clientului
   PATCH  /api/admin/payments?id=<id> { paid_on, amount, note? }       — modifică o plată
   DELETE /api/admin/payments?id=<id>                                  — șterge o plată
   Fiecare răspuns întoarce lista actualizată a plăților clientului. */
const { rest } = require('../_lib/db');
const { allow, jsonBody } = require('../_lib/http');
const { requireAdmin } = require('../_lib/auth');
const { parseAmount, validDay } = require('../_lib/money');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const list = requestId => rest(`payments?select=id,paid_on,amount,note&request_id=eq.${requestId}&order=paid_on.asc,id.asc`);

// Întoarce { data } sau { errors: [câmpuri greșite] }
function validate(body) {
  const data = {
    paid_on: body.paid_on,
    amount: parseAmount(body.amount),
    note: typeof body.note === 'string' ? body.note.trim() : '',
  };
  const errors = [];
  if (!validDay(data.paid_on)) errors.push('paid_on');
  if (data.amount === null) errors.push('amount');
  if (data.note.length > 200) errors.push('note');
  return errors.length ? { errors } : { data };
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST', 'PATCH', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;
  const body = jsonBody(req) || {};

  try {
    if (req.method === 'POST') {
      const requestId = String(body.request_id || '');
      if (!UUID_RE.test(requestId)) return res.status(404).json({ ok: false, error: 'notfound' });
      const { data, errors } = validate(body);
      if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
      const [client] = await rest(`requests?select=id&id=eq.${requestId}`);
      if (!client) return res.status(404).json({ ok: false, error: 'notfound' });
      await rest('payments', { method: 'POST', body: { ...data, request_id: requestId }, prefer: 'return=minimal' });
      return res.status(201).json({ ok: true, payments: await list(requestId) });
    }

    const id = String(req.query.id || '');
    if (!/^\d{1,18}$/.test(id)) return res.status(404).json({ ok: false, error: 'notfound' });
    const [payment] = await rest(`payments?select=request_id&id=eq.${id}`);
    if (!payment) return res.status(404).json({ ok: false, error: 'notfound' });

    if (req.method === 'PATCH') {
      const { data, errors } = validate(body);
      if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
      await rest(`payments?id=eq.${id}`, { method: 'PATCH', body: data, prefer: 'return=minimal' });
    } else {
      await rest(`payments?id=eq.${id}`, { method: 'DELETE' });
    }
    return res.status(200).json({ ok: true, payments: await list(payment.request_id) });
  } catch (e) {
    console.error('Operația pe plată a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db' });
  }
};
module.exports.validate = validate;
