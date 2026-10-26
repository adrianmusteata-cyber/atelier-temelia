/* GET /api/admin/requests?status=<status|toate>&cursor=<created_at>
   Lista cererilor, cele mai noi primele, câte 50, plus numărul pe fiecare status. */
const { rest } = require('../../_lib/db');
const { allow } = require('../../_lib/http');
const { requireAdmin } = require('../../_lib/auth');
const { STATUSES } = require('../../_lib/labels');

const PAGE = 50;

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;

  const status = STATUSES[req.query.status] ? req.query.status : 'toate';
  const cursor = typeof req.query.cursor === 'string' && !isNaN(Date.parse(req.query.cursor)) ? req.query.cursor : null;

  let q = `requests?select=id,created_at,name,phone,type,service,status&order=created_at.desc&limit=${PAGE + 1}`;
  if (status !== 'toate') q += `&status=eq.${status}`;
  if (cursor) q += `&created_at=lt.${encodeURIComponent(cursor)}`;

  try {
    const [items, all] = await Promise.all([rest(q), rest('requests?select=status')]);
    const counts = { toate: all.length };
    Object.keys(STATUSES).forEach(s => { counts[s] = 0; });
    all.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const more = items.length > PAGE;
    const page = items.slice(0, PAGE);
    return res.status(200).json({
      ok: true,
      items: page,
      counts,
      nextCursor: more ? page[page.length - 1].created_at : null,
    });
  } catch (e) {
    console.error('Citirea cererilor a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db' });
  }
};
