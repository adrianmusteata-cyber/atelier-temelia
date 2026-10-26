/* GET   /api/admin/requests/:id            — toate detaliile unei cereri
   PATCH /api/admin/requests/:id { status }  — schimbă statusul */
const { rest } = require('../../_lib/db');
const { allow, jsonBody } = require('../../_lib/http');
const { requireAdmin } = require('../../_lib/auth');
const { STATUSES } = require('../../_lib/labels');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'PATCH'])) return;
  if (!requireAdmin(req, res)) return;

  const id = String(req.query.id || '');
  if (!UUID_RE.test(id)) return res.status(404).json({ ok: false, error: 'notfound' });

  try {
    if (req.method === 'GET') {
      const [item] = await rest(`requests?select=*&id=eq.${id}`);
      if (!item) return res.status(404).json({ ok: false, error: 'notfound' });
      return res.status(200).json({ ok: true, item });
    }

    const status = (jsonBody(req) || {}).status;
    if (!STATUSES[status]) return res.status(400).json({ ok: false, error: 'status' });
    const [item] = await rest(`requests?id=eq.${id}`, {
      method: 'PATCH',
      body: { status, status_updated_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    if (!item) return res.status(404).json({ ok: false, error: 'notfound' });
    return res.status(200).json({ ok: true, item });
  } catch (e) {
    console.error('Operația pe cerere a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db' });
  }
};
