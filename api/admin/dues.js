/* Scadențe. kind=pay — „De plătit” (documente de la furnizori, cu rate); kind=get — „De încasat” (ratele clienților).
   GET    /api/admin/dues?count=1                         → { overdue } — rate restante în ambele liste
   GET    /api/admin/dues?kind=pay&filter=open|overdue|all → ratele, cu datele documentului și totalurile pe monede
   GET    /api/admin/dues?kind=pay&id=<id>                → documentul, cu ratele, articolele și fișierele
   POST   /api/admin/dues?kind=pay { ...câmpuri, items[], installments[], force? }
   PATCH  /api/admin/dues?kind=pay&id=<id> { ...câmpuri, items[], installments[] } — ratele plătite rămân neatinse
   DELETE /api/admin/dues?kind=pay&id=<id>                — cheltuielile create din plăți rămân
   POST   /api/admin/dues?kind=pay&action=pay { installment_id, paid_on, paid_amount } — plata + cheltuiala
   DELETE /api/admin/dues?kind=pay&action=pay&installment_id=<id> — anulează plata, șterge cheltuiala
   GET    /api/admin/dues?kind=get&filter=open|overdue|all → ratele cu starea calculată din plățile clienților
   POST   /api/admin/dues?kind=get { request_id | new_client, doc_number, doc_date, note, installments[] }
   PATCH  /api/admin/dues?kind=get&id=<id> { due_date, amount, note }
   DELETE /api/admin/dues?kind=get&id=<id> */
const { rest } = require('../_lib/db');
const { allow, jsonBody } = require('../_lib/http');
const { requireAdmin } = require('../_lib/auth');
const { parseAmount, validDay, validDate, todayChisinau } = require('../_lib/money');
const dues = require('../_lib/dues');
const expenses = require('../_lib/expenses');
const store = require('../_lib/storage');

const ID_RE = /^\d{1,18}$/;
const round = x => Math.round(x * 100) / 100;
const notfound = res => res.status(404).json({ ok: false, error: 'notfound' });

// Totaluri pe monede: ce e de achitat și cât e restant
function totals(rows) {
  const t = {};
  rows.forEach(r => {
    if (r.state === 'paid') return;
    const c = (t[r.currency] ||= { open: 0, overdue: 0 });
    c.open = round(c.open + r.rest);
    if (r.state === 'overdue') c.overdue = round(c.overdue + r.rest);
  });
  return t;
}
const pick = (rows, filter) => (filter === 'all' ? rows : rows.filter(r => (filter === 'overdue' ? r.state === 'overdue' : r.state !== 'paid')));

/* ---------- De plătit ---------- */

const payable = id => rest(`payables?select=*,payable_items(*),payable_installments(*),documents(id,doc_type,page,mime)&id=eq.${id}` +
  '&payable_items.order=pos.asc&payable_installments.order=due_date.asc,id.asc&documents.order=page.asc')
  .then(([p]) => p && {
    ...p, items: p.payable_items, payable_items: undefined,
    installments: p.payable_installments.map(i => ({ ...i, ...dues.payableState(i) })), payable_installments: undefined,
  });

async function payList(req, res) {
  const filter = ['overdue', 'all'].includes(req.query.filter) ? req.query.filter : 'open';
  let q = 'payable_installments?select=*,payables(id,supplier,doc_number,currency,amount_total)&order=due_date.asc,id.asc&limit=2000';
  if (filter !== 'all') q += '&paid_on=is.null';
  if (filter === 'overdue') q += `&due_date=lt.${todayChisinau()}`;
  const rows = (await rest(q)).map(({ payables: p, ...i }) => ({
    ...i, ...dues.payableState(i), amount: Number(i.amount), rest: i.paid_on ? 0 : Number(i.amount),
    payable_id: p.id, supplier: p.supplier, doc_number: p.doc_number, currency: p.currency,
  }));
  return res.status(200).json({ ok: true, items: rows, totals: totals(rows) });
}

async function payWrite(req, res, body, id) {
  if (req.method === 'DELETE') {
    const [p] = await rest(`payables?select=id,documents(path)&id=eq.${id}`);
    if (!p) return notfound(res);
    await rest(`payables?id=eq.${id}`, { method: 'DELETE' });
    await store.remove(p.documents.map(d => d.path)).catch(e => console.error('Ștergerea fișierelor a eșuat:', e.message));
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const { data, items, installments, errors } = dues.validatePayable(body);
    if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
    if (!body.force) {
      const duplicates = await dues.findPayableDuplicates(data);
      if (duplicates.length) return res.status(409).json({ ok: false, error: 'duplicate', duplicates });
    }
    const p = await dues.createPayable(data, items, installments);
    return res.status(201).json({ ok: true, item: await payable(p.id) });
  }

  // PATCH: ratele plătite rămân; cele neplătite se înlocuiesc cu cele trimise
  const current = await payable(id);
  if (!current) return notfound(res);
  const paidCount = current.installments.filter(i => i.paid_on).length;
  const list = Array.isArray(body.installments) ? body.installments : [];
  const { data, items, errors } = expenses.validate(body);
  const inst = list.length || !paidCount ? dues.validateInstallments(list) : { installments: [] };
  const all = [...(errors || []), ...(inst.error ? ['installments'] : [])];
  if (all.length) return res.status(400).json({ ok: false, error: 'invalid', fields: all });
  await rest(`payables?id=eq.${id}`, { method: 'PATCH', body: data, prefer: 'return=minimal' });
  await rest(`payable_items?payable_id=eq.${id}`, { method: 'DELETE' });
  if (items.length) await rest('payable_items', { method: 'POST', body: items.map(i => ({ ...i, payable_id: Number(id) })), prefer: 'return=minimal' });
  await rest(`payable_installments?payable_id=eq.${id}&paid_on=is.null`, { method: 'DELETE' });
  if (inst.installments.length) {
    await rest('payable_installments', { method: 'POST', body: inst.installments.map(i => ({ ...i, payable_id: Number(id) })), prefer: 'return=minimal' });
  }
  return res.status(200).json({ ok: true, item: await payable(id) });
}

// Plata unei rate (și anularea ei) prin funcțiile SQL: rata și cheltuiala se schimbă împreună
async function payInstallment(req, res, body) {
  if (req.method === 'DELETE') {
    const iid = String(req.query.installment_id || '');
    if (!ID_RE.test(iid)) return notfound(res);
    try {
      await rest('rpc/unpay_installment', { method: 'POST', body: { p_id: Number(iid) } });
    } catch (e) {
      if (/notfound/.test(e.message)) return notfound(res);
      throw e;
    }
    return res.status(200).json({ ok: true });
  }
  const iid = String(body.installment_id || '');
  const amount = parseAmount(String(body.paid_amount ?? ''));
  const errors = [];
  if (!ID_RE.test(iid)) errors.push('installment_id');
  if (!validDay(body.paid_on)) errors.push('paid_on');
  if (amount === null) errors.push('paid_amount');
  if (errors.length) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
  try {
    const expenseId = await rest('rpc/pay_installment', { method: 'POST', body: { p_id: Number(iid), p_paid_on: body.paid_on, p_amount: amount } });
    return res.status(200).json({ ok: true, expense_id: expenseId });
  } catch (e) {
    if (/already_paid/.test(e.message)) return res.status(409).json({ ok: false, error: 'already_paid' });
    if (/notfound/.test(e.message)) return notfound(res);
    throw e;
  }
}

/* ---------- De încasat ---------- */

async function getList(req, res) {
  const filter = ['overdue', 'all'].includes(req.query.filter) ? req.query.filter : 'open';
  const rows = await dues.receivablesWithState();
  rows.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id));
  return res.status(200).json({ ok: true, items: pick(rows, filter), totals: totals(rows) });
}

async function getWrite(req, res, body, id) {
  if (req.method === 'POST') {
    const r = await dues.createReceivables(body);
    if (r.errors) return res.status(400).json({ ok: false, error: 'invalid', fields: r.errors });
    if (r.notfound) return notfound(res);
    return res.status(201).json({ ok: true, ...r });
  }
  const [rate] = await rest(`receivables?select=id,group_id&id=eq.${id}`);
  if (!rate) return notfound(res);

  if (req.method === 'DELETE') {
    await rest(`receivables?id=eq.${id}`, { method: 'DELETE' });
    // Ultima rată a documentului: se șterge și documentul original
    if (rate.group_id) {
      const left = await rest(`receivables?select=id&group_id=eq.${rate.group_id}`);
      if (!left.length) {
        const docs = await rest(`documents?select=path&receivable_group=eq.${rate.group_id}`);
        await rest(`documents?receivable_group=eq.${rate.group_id}`, { method: 'DELETE' });
        await store.remove(docs.map(d => d.path)).catch(e => console.error('Ștergerea fișierelor a eșuat:', e.message));
      }
    }
    return res.status(200).json({ ok: true });
  }

  const amount = parseAmount(String(body.amount ?? ''));
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const errors = [];
  if (!validDate(body.due_date)) errors.push('due_date');
  if (amount === null) errors.push('amount');
  if (note.length > 1000) errors.push('note');
  if (errors.length) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });
  await rest(`receivables?id=eq.${id}`, { method: 'PATCH', body: { due_date: body.due_date, amount, note }, prefer: 'return=minimal' });
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;
  const body = jsonBody(req) || {};
  const kind = req.query.kind;
  const id = String(req.query.id || '');

  try {
    if (req.query.count) return res.status(200).json({ ok: true, overdue: await dues.overdueCount() });
    if (kind !== 'pay' && kind !== 'get') return notfound(res);
    if (kind === 'pay' && req.query.action === 'pay') return await payInstallment(req, res, body);
    if (req.method === 'GET' && !id) return await (kind === 'pay' ? payList(req, res) : getList(req, res));
    if (req.method !== 'POST' && !ID_RE.test(id)) return notfound(res);
    if (kind === 'pay') {
      if (req.method === 'GET') {
        const item = await payable(id);
        return item ? res.status(200).json({ ok: true, item }) : notfound(res);
      }
      return await payWrite(req, res, body, id);
    }
    if (req.method === 'GET') return notfound(res);
    return await getWrite(req, res, body, id);
  } catch (e) {
    console.error('Operația pe scadențe a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db', detail: e.message.slice(0, 300) });
  }
};
