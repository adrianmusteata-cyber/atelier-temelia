/* GET   /api/admin/requests/:id  — fișa clientului, cu istoricul etapelor și plățile
   PATCH /api/admin/requests/:id { status?, comment?, notes?, contract_value?, currency? }
         — mută clientul în altă etapă (la „respins” motivul e obligatoriu),
           îi salvează notele și/sau valoarea contractului și moneda. Istoricul îl scrie trigger-ul din baza de date. */
const { rest } = require('../../_lib/db');
const { allow, jsonBody } = require('../../_lib/http');
const { requireAdmin } = require('../../_lib/auth');
const { STATUSES } = require('../../_lib/labels');
const { CURRENCIES, parseAmount } = require('../../_lib/money');
const { paymentText, isPayment, sendPayment, notifySafely } = require('../../_lib/notify');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Suma plăților din fișă, pentru mesajul de pe Telegram (null dacă nu se poate citi)
const paidTotal = id => rest(`payments?select=amount&request_id=eq.${id}`)
  .then(rows => rows.reduce((s, p) => s + Number(p.amount), 0))
  .catch(() => null);

const history = id => rest(`status_history?select=from_status,to_status,comment,at&request_id=eq.${id}&order=at.asc,id.asc`);
const payments = id => rest(`payments?select=id,paid_on,amount,note&request_id=eq.${id}&order=paid_on.asc,id.asc`);

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'PATCH'])) return;
  if (!requireAdmin(req, res)) return;

  const id = String(req.query.id || '');
  if (!UUID_RE.test(id)) return res.status(404).json({ ok: false, error: 'notfound' });

  try {
    if (req.method === 'GET') {
      const [[item], hist, pays] = await Promise.all([rest(`requests?select=*&id=eq.${id}`), history(id), payments(id)]);
      if (!item) return res.status(404).json({ ok: false, error: 'notfound' });
      return res.status(200).json({ ok: true, item, history: hist, payments: pays });
    }

    const body = jsonBody(req) || {};
    const patch = {};
    if ('notes' in body) {
      if (typeof body.notes !== 'string') return res.status(400).json({ ok: false, error: 'notes' });
      patch.notes = body.notes.trim().slice(0, 5000);
    }
    if ('status' in body) {
      const status = body.status;
      const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
      if (!STATUSES[status]) return res.status(400).json({ ok: false, error: 'status' });
      if (status === 'respins' && !comment) return res.status(400).json({ ok: false, error: 'comment' });
      Object.assign(patch, { status, status_comment: comment, status_updated_at: new Date().toISOString() });
    }
    if ('contract_value' in body) {
      // Gol = fără valoare de contract
      const empty = body.contract_value === null || body.contract_value === '';
      const value = empty ? null : parseAmount(body.contract_value, { allowZero: true });
      if (!empty && value === null) return res.status(400).json({ ok: false, error: 'contract_value' });
      patch.contract_value = value;
    }
    if ('currency' in body) {
      if (!CURRENCIES.includes(body.currency)) return res.status(400).json({ ok: false, error: 'currency' });
      patch.currency = body.currency;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'empty' });

    // Etapa de dinainte: anunțăm plata doar la o trecere reală în Avans / Plătit
    let before = null;
    if (isPayment(patch.status)) [before] = await rest(`requests?select=status&id=eq.${id}`);

    const [item] = await rest(`requests?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!item) return res.status(404).json({ ok: false, error: 'notfound' });
    if (before && before.status !== item.status) await notifySafely([paidTotal(id).then(paid => sendPayment(paymentText(item, paid)))]);
    return res.status(200).json({ ok: true, item, history: await history(id) });
  } catch (e) {
    console.error('Operația pe cerere a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db' });
  }
};
