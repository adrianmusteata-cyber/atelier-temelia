/* GET /api/admin/report              — ultimele 12 luni: venituri (plățile clienților) și cheltuieli, pe monede
   GET /api/admin/report?month=YYYY-MM — detaliul lunii: cheltuielile pe categorii și plățile primite
   Lei și euro nu se adună niciodată între ele. */
const { rest } = require('../_lib/db');
const { allow } = require('../_lib/http');
const { requireAdmin } = require('../_lib/auth');
const { todayChisinau } = require('../_lib/money');

const round = x => Math.round(x * 100) / 100;
const shift = (m, k) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};

// Plățile poartă moneda clientului
const paymentsFrom = (from, to) => rest(`payments?select=amount,paid_on,request_id,requests(name,currency)&paid_on=gte.${from}&paid_on=lt.${to}&order=paid_on.asc`);
const expensesFrom = (from, to) => rest(`expenses?select=amount_total,doc_date,currency,category&doc_date=gte.${from}&doc_date=lt.${to}`);

async function year(res) {
  const now = todayChisinau().slice(0, 7);
  const first = shift(now, -11);
  const [pays, exps] = await Promise.all([paymentsFrom(`${first}-01`, `${shift(now, 1)}-01`), expensesFrom(`${first}-01`, `${shift(now, 1)}-01`)]);

  const months = Array.from({ length: 12 }, (_, i) => shift(now, -i)); // cele mai noi primele
  const table = {}; // { MDL: { '2026-10': { income, expense } } }
  const cell = (cur, m) => ((table[cur] ||= {})[m] ||= { income: 0, expense: 0 });
  pays.forEach(p => { const c = cell(p.requests?.currency || 'MDL', p.paid_on.slice(0, 7)); c.income = round(c.income + Number(p.amount)); });
  exps.forEach(e => { const c = cell(e.currency, e.doc_date.slice(0, 7)); c.expense = round(c.expense + Number(e.amount_total)); });

  const currencies = ['MDL', 'EUR'].filter(c => table[c]).map(cur => {
    const rows = months.map(m => ({ month: m, ...(table[cur][m] || { income: 0, expense: 0 }) }));
    const income = round(rows.reduce((s, r) => s + r.income, 0));
    const expense = round(rows.reduce((s, r) => s + r.expense, 0));
    return { currency: cur, rows, totals: { income, expense, result: round(income - expense) } };
  });
  return res.status(200).json({ ok: true, currencies });
}

async function month(m, res) {
  const [pays, exps] = await Promise.all([paymentsFrom(`${m}-01`, `${shift(m, 1)}-01`), expensesFrom(`${m}-01`, `${shift(m, 1)}-01`)]);
  const byCur = {};
  exps.forEach(e => {
    const c = (byCur[e.currency] ||= { total: 0, categories: {} });
    c.total = round(c.total + Number(e.amount_total));
    c.categories[e.category] = round((c.categories[e.category] || 0) + Number(e.amount_total));
  });
  const payments = pays.map(p => ({ request_id: p.request_id, name: p.requests?.name || '—', paid_on: p.paid_on, amount: Number(p.amount), currency: p.requests?.currency || 'MDL' }));
  return res.status(200).json({ ok: true, month: m, expenses: byCur, payments });
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;
  try {
    const m = String(req.query.month || '');
    if (m) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return res.status(400).json({ ok: false, error: 'month' });
      return await month(m, res);
    }
    return await year(res);
  } catch (e) {
    console.error('Raportul a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db', detail: e.message.slice(0, 300) });
  }
};
