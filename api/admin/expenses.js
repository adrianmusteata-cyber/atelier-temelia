/* GET    /api/admin/expenses?month=YYYY-MM|all&category=&q= — lista și totalurile pe monede
   GET    /api/admin/expenses?id=<id>                         — o cheltuială, cu articolele și documentele
   POST   /api/admin/expenses { ...câmpuri, items[], force? } — cheltuială adăugată manual
   PATCH  /api/admin/expenses?id=<id> { ...câmpuri, items[] } — modifică (articolele se înlocuiesc toate)
   DELETE /api/admin/expenses?id=<id>                         — șterge, împreună cu documentele din Storage */
const { rest } = require('../_lib/db');
const { allow, jsonBody } = require('../_lib/http');
const { requireAdmin } = require('../_lib/auth');
const { EXPENSE_CATEGORIES } = require('../_lib/labels');
const expenses = require('../_lib/expenses');
const store = require('../_lib/storage');

const LIST_FIELDS = 'id,doc_date,supplier,doc_number,category,currency,amount_total,source,documents(id)';

// „2026-10” → [prima zi a lunii, prima zi a lunii următoare]
function monthRange(m) {
  const [y, mo] = m.split('-').map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return [`${m}-01`, `${next}-01`];
}

async function list(req, res) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : null;
  const category = EXPENSE_CATEGORIES[req.query.category] ? req.query.category : null;
  // Fără caractere care au sens în filtrele PostgREST
  const q = String(req.query.q || '').replace(/[,()*%\\:."]/g, ' ').trim().slice(0, 60);

  let path = `expenses?select=${LIST_FIELDS}&order=doc_date.desc,id.desc&limit=1000`;
  if (month) {
    const [from, to] = monthRange(month);
    path += `&doc_date=gte.${from}&doc_date=lt.${to}`;
  }
  if (category) path += `&category=eq.${category}`;
  if (q) path += `&or=(supplier.ilike.*${encodeURIComponent(q)}*,doc_number.ilike.*${encodeURIComponent(q)}*)`;

  const rows = await rest(path);
  const totals = {};
  rows.forEach(r => { totals[r.currency] = Math.round(((totals[r.currency] || 0) + Number(r.amount_total)) * 100) / 100; });
  const items = rows.map(({ documents, ...r }) => ({ ...r, has_doc: (documents || []).length > 0 }));
  return res.status(200).json({ ok: true, items, totals });
}

const one = id => rest(`expenses?select=*,expense_items(*),documents(id,doc_type,page,mime)&id=eq.${id}&expense_items.order=pos.asc&documents.order=page.asc`)
  .then(([e]) => e && { ...e, items: e.expense_items, expense_items: undefined });

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;
  const body = jsonBody(req) || {};
  const id = String(req.query.id || '');
  if (req.method !== 'POST' && (req.method !== 'GET' || id) && !/^\d{1,18}$/.test(id)) {
    return res.status(404).json({ ok: false, error: 'notfound' });
  }

  try {
    if (req.method === 'GET') {
      if (!id) return await list(req, res);
      const item = await one(id);
      if (!item) return res.status(404).json({ ok: false, error: 'notfound' });
      return res.status(200).json({ ok: true, item });
    }

    if (req.method === 'DELETE') {
      const [exp] = await rest(`expenses?select=id,documents(path)&id=eq.${id}`);
      if (!exp) return res.status(404).json({ ok: false, error: 'notfound' });
      await rest(`expenses?id=eq.${id}`, { method: 'DELETE' });
      // Fișierele se șterg din cod; dacă nu reușește, cheltuiala rămâne ștearsă
      await store.remove(exp.documents.map(d => d.path)).catch(e => console.error('Ștergerea fișierelor a eșuat:', e.message));
      return res.status(200).json({ ok: true });
    }

    const { data, items, errors } = expenses.validate(body);
    if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

    if (req.method === 'POST') {
      if (!body.force) {
        const duplicates = await expenses.findDuplicates(data);
        if (duplicates.length) return res.status(409).json({ ok: false, error: 'duplicate', duplicates });
      }
      const exp = await expenses.createExpense(data, items, 'manual');
      return res.status(201).json({ ok: true, item: await one(exp.id) });
    }

    const [updated] = await rest(`expenses?id=eq.${id}`, { method: 'PATCH', body: data, prefer: 'return=representation' });
    if (!updated) return res.status(404).json({ ok: false, error: 'notfound' });
    await expenses.saveItems(id, items);
    return res.status(200).json({ ok: true, item: await one(id) });
  } catch (e) {
    console.error('Operația pe cheltuială a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db', detail: e.message.slice(0, 300) });
  }
};
