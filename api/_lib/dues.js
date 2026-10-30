/* Scadențe: „De plătit” (documente de la furnizori, cu rate) și „De încasat” (rate ale clienților).
   Starea ratelor de încasat se calculează din plățile clientului: plățile acoperă ratele în ordinea scadenței. */
const { rest } = require('./db');
const expenses = require('./expenses');
const { CURRENCIES, parseAmount, validDate, daysBetween, todayChisinau } = require('./money');

const MAX_INSTALLMENTS = 60;
const SOON_DAYS = 7;
const str = v => (v === null || v === undefined ? '' : String(v).trim());
const round = x => Math.round(x * 100) / 100;

// „20.10.2026” sau „2026-10-20” → „2026-10-20”; altfel ''
function isoDate(v) {
  const s = str(v);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : s;
  return validDate(iso) ? iso : '';
}
const plusDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const amountText = v => {
  const x = Number(String(v ?? '').replace(/[\s ]/g, '').replace(',', '.'));
  return v === '' || v === null || v === undefined || !Number.isFinite(x) || x <= 0 ? '' : String(round(x));
};

// Ratele citite de Claude; fără nicio dată → data documentului + 30 de zile, marcată „propusă”
function installmentsFromClaude(list, docDate, total) {
  const rows = (Array.isArray(list) ? list : []).filter(Boolean)
    .map(r => ({ due_date: isoDate(r.due_date), amount: amountText(r.amount) }))
    .filter(r => r.due_date || r.amount)
    .slice(0, MAX_INSTALLMENTS);
  if (!rows.length) rows.push({ due_date: '', amount: amountText(total) });
  if (rows.length === 1 && !rows[0].due_date && docDate) { rows[0].due_date = plusDays(docDate, 30); rows[0].proposed = true; }
  return rows;
}

// Întoarce { installments } sau { error }
function validateInstallments(list) {
  const raw = Array.isArray(list) ? list : [];
  if (!raw.length || raw.length > MAX_INSTALLMENTS) return { error: 'installments' };
  const out = [];
  for (const r of raw) {
    const due = str(r && r.due_date), amount = parseAmount(str(r && r.amount));
    if (!validDate(due) || amount === null) return { error: 'installments' };
    out.push({ due_date: due, amount });
  }
  return { installments: out };
}

/* ---------- De plătit ---------- */

function payableFromClaude(input) {
  const f = expenses.fieldsFromClaude(input);
  f.installments = installmentsFromClaude(input.installments, f.doc_date, f.amount_total);
  return f;
}

function validatePayable(body) {
  const r = expenses.validate(body);
  const inst = validateInstallments(body && body.installments);
  const errors = [...(r.errors || []), ...(inst.error ? [inst.error] : [])];
  return errors.length ? { errors } : { data: r.data, items: r.items, installments: inst.installments };
}

async function findPayableDuplicates(data, exceptId = null) {
  const rows = await rest(`payables?select=id,supplier,doc_number,doc_date,amount_total,currency&doc_date=eq.${data.doc_date}`);
  const sup = data.supplier.toLowerCase();
  return rows.filter(r => String(r.id) !== String(exceptId) && r.supplier.toLowerCase() === sup &&
    (data.doc_number ? r.doc_number === data.doc_number : Number(r.amount_total) === data.amount_total));
}

async function createPayable(data, items, installments) {
  const [p] = await rest('payables', { method: 'POST', body: data, prefer: 'return=representation' });
  try {
    if (items.length) await rest('payable_items', { method: 'POST', body: items.map(i => ({ ...i, payable_id: p.id })), prefer: 'return=minimal' });
    await rest('payable_installments', { method: 'POST', body: installments.map(i => ({ ...i, payable_id: p.id })), prefer: 'return=minimal' });
  } catch (e) {
    await rest(`payables?id=eq.${p.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return p;
}

// Starea unei rate de plătit, pentru listă
function payableState(i, today = todayChisinau()) {
  if (i.paid_on) return { state: 'paid' };
  const d = daysBetween(today, i.due_date);
  return d < 0 ? { state: 'overdue', days: -d } : d <= SOON_DAYS ? { state: 'soon', days: d } : { state: 'open', days: d };
}

/* ---------- De încasat ---------- */

function receivableFromClaude(input) {
  const s = k => str(input[k]);
  const cp = input.counterparty && typeof input.counterparty === 'object' ? input.counterparty : {};
  let currency = s('currency').toUpperCase();
  if (['LEI', 'MDL', ''].includes(currency)) currency = 'MDL';
  const notes = [];
  if (!CURRENCIES.includes(currency)) { notes.push(`Moneda pe document: ${currency}`); currency = 'MDL'; }
  const docDate = isoDate(input.doc_date);
  const total = amountText(input.amount_total);
  return {
    counterparty: { name: str(cp.name), idno: str(cp.idno), phone: str(cp.phone), email: str(cp.email) },
    doc_number: s('doc_number'),
    doc_date: docDate,
    currency,
    amount_total: total,
    is_contract: input.is_contract === true,
    note: notes.join('\n'),
    installments: installmentsFromClaude(input.installments, docDate, total),
  };
}

// Clienții din CRM care seamănă cu contrapartea: email, ultimele 8 cifre ale telefonului sau numele
async function clientMatches(cp) {
  const rows = await rest('requests?select=id,name,phone,email,currency,contract_value&order=created_at.desc&limit=5000');
  const p8 = str(cp.phone).replace(/\D/g, '').slice(-8), email = str(cp.email).toLowerCase(), name = str(cp.name).toLowerCase();
  const words = name.split(/\s+/).filter(w => w.length > 2);
  return rows.filter(r => (p8.length === 8 && str(r.phone).replace(/\D/g, '').slice(-8) === p8) ||
    (email && str(r.email).toLowerCase() === email) ||
    (name && (r.name.toLowerCase().includes(name) || name.includes(r.name.toLowerCase()) ||
      (words.length > 1 && words.every(w => r.name.toLowerCase().includes(w))))))
    .slice(0, 8);
}

// rates: ratele unui client (orice ordine); paid: totalul plăților lui → ratele cu starea calculată
function allocate(rates, paid, today = todayChisinau()) {
  let left = round(paid);
  return [...rates].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id)).map(r => {
    const amount = Number(r.amount);
    const covered = round(Math.min(amount, Math.max(0, left)));
    left = round(left - covered);
    const rest = round(amount - covered);
    const d = daysBetween(today, r.due_date);
    const state = rest <= 0 ? 'paid' : d < 0 ? 'overdue' : d <= SOON_DAYS ? 'soon' : 'open';
    return { ...r, amount, covered, rest, state, days: Math.abs(d), partial: covered > 0 && rest > 0 };
  });
}

// Ratele de încasat cu starea calculată, pentru clienții ceruți (sau toți)
async function receivablesWithState(requestIds = null) {
  const filter = requestIds ? `&request_id=in.(${requestIds.join(',')})` : '';
  const [rates, pays] = await Promise.all([
    rest(`receivables?select=*,requests(name,currency)${filter}&order=due_date.asc,id.asc&limit=5000`),
    rest(`payments?select=request_id,amount${filter}&limit=10000`),
  ]);
  const paid = {};
  pays.forEach(p => { paid[p.request_id] = round((paid[p.request_id] || 0) + Number(p.amount)); });
  const byClient = {};
  rates.forEach(r => (byClient[r.request_id] ||= []).push(r));
  return Object.entries(byClient).flatMap(([id, list]) => allocate(list, paid[id] || 0))
    .map(({ requests, ...r }) => ({ ...r, client: requests?.name || '—', currency: requests?.currency || 'MDL' }));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Rate de încasat noi pentru un client existent (request_id) sau unul nou (new_client: { name, phone, email }).
   Opțional: set_currency (schimbă moneda clientului), set_contract_value (completează valoarea contractului).
   Întoarce { group_id, request_id } sau { errors } / { notfound: true } */
async function createReceivables(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const inst = validateInstallments(b.installments);
  if (inst.error) errors.push('installments');
  const doc_number = str(b.doc_number), note = str(b.note);
  const doc_date = str(b.doc_date) ? isoDate(b.doc_date) : null;
  if (doc_number.length > 60) errors.push('doc_number');
  if (note.length > 1000) errors.push('note');
  if (str(b.doc_date) && !doc_date) errors.push('doc_date');
  const nc = b.new_client && typeof b.new_client === 'object' ? b.new_client : null;
  const client = nc && { name: str(nc.name), phone: str(nc.phone), email: str(nc.email) };
  if (!UUID_RE.test(str(b.request_id)) && !client) errors.push('client');
  if (client && (!client.name || client.name.length > 100 || client.phone.length > 30 || client.email.length > 150 ||
    (!client.phone && !client.email) || (client.email && !EMAIL_RE.test(client.email)))) errors.push('new_client');
  const contract = b.set_contract_value ? parseAmount(str(b.set_contract_value)) : null;
  if (b.set_contract_value && contract === null) errors.push('set_contract_value');
  if (b.set_currency && !CURRENCIES.includes(b.set_currency)) errors.push('set_currency');
  if (errors.length) return { errors };

  let requestId = str(b.request_id);
  if (client) {
    const [c] = await rest('requests', { method: 'POST', body: { ...client, status: 'noua', source: 'document', channel: '', currency: b.set_currency || 'MDL' }, prefer: 'return=representation' });
    requestId = c.id;
  } else {
    const [c] = await rest(`requests?select=id&id=eq.${requestId}`);
    if (!c) return { notfound: true };
  }
  const patch = {};
  if (b.set_currency && !client) patch.currency = b.set_currency;
  if (contract !== null) patch.contract_value = contract;
  if (Object.keys(patch).length) await rest(`requests?id=eq.${requestId}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });

  const group_id = require('crypto').randomUUID();
  await rest('receivables', {
    method: 'POST',
    body: inst.installments.map(i => ({ ...i, request_id: requestId, doc_number, doc_date, note, group_id })),
    prefer: 'return=minimal',
  });
  return { group_id, request_id: requestId };
}

// Câte rate sunt restante, în ambele liste (numărul din antet)
async function overdueCount() {
  const today = todayChisinau();
  const [pay, rec] = await Promise.all([
    rest(`payable_installments?select=id&paid_on=is.null&due_date=lt.${today}`),
    receivablesWithState(),
  ]);
  return pay.length + rec.filter(r => r.state === 'overdue').length;
}

module.exports = {
  payableFromClaude, validatePayable, findPayableDuplicates, createPayable, payableState, validateInstallments,
  receivableFromClaude, clientMatches, allocate, receivablesWithState, overdueCount, isoDate, createReceivables,
};
