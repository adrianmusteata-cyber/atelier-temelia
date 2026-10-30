/* Cheltuieli: validare, câmpurile citite de Claude, duplicate, salvare cu articole */
const { rest } = require('./db');
const { EXPENSE_CATEGORIES } = require('./labels');
const { CURRENCIES, parseAmount, validDay } = require('./money');

const MAX_ITEMS = 300;
const str = v => (v === null || v === undefined ? '' : String(v).trim());
// Număr citit de Claude → text pentru formular (sumele rotunjite la 2 zecimale, cantitatea la 3)
const n2 = (v, dec = 2) => {
  if (v === null || v === undefined || v === '') return '';
  const x = Number(String(v).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(x) ? String(Math.round(Math.abs(x) * 10 ** dec) / 10 ** dec) : String(v);
};

// Cantitatea: cel mult 3 zecimale
function parseQty(v) {
  const s = str(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,11}(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}
// Sumă opțională: gol → null, greșit → undefined
const optAmount = v => (str(v) === '' ? null : (parseAmount(str(v), { allowZero: true }) ?? undefined));

// Argumentele uneltei lui Claude → câmpurile ecranului de verificare
function fieldsFromClaude(input) {
  const s = k => str(input[k]);
  const notes = [];
  let currency = s('currency').toUpperCase();
  if (['LEI', 'MDL', ''].includes(currency)) currency = 'MDL';
  if (!CURRENCIES.includes(currency)) { notes.push(`Moneda pe document: ${currency}`); currency = 'MDL'; }
  // „20.10.2026” (cum e scris pe documentele din Moldova) → „2026-10-20”
  const dmy = s('doc_date').match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : s('doc_date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  if (!date && s('doc_date')) notes.push(`Data pe document: ${s('doc_date')}`);
  return {
    supplier: s('supplier'),
    supplier_idno: s('supplier_idno'),
    doc_number: s('doc_number'),
    doc_date: date,
    currency,
    amount_net: n2(input.amount_net),
    vat: n2(input.vat),
    amount_total: n2(input.amount_total),
    category: EXPENSE_CATEGORIES[s('category')] ? s('category') : 'altele',
    note: notes.join('\n'),
    items: (Array.isArray(input.items) ? input.items : []).filter(i => i && str(i.name)).slice(0, MAX_ITEMS).map(i => ({
      name: str(i.name), code: str(i.code), unit: str(i.unit),
      qty: n2(i.qty, 3), unit_price: n2(i.unit_price), line_total: n2(i.line_total),
    })),
  };
}

// Întoarce { data, items } sau { errors: [câmpuri greșite] }
function validate(body) {
  const f = body && typeof body === 'object' ? body : {};
  const data = {
    supplier: str(f.supplier),
    supplier_idno: str(f.supplier_idno),
    doc_number: str(f.doc_number),
    doc_date: str(f.doc_date),
    currency: str(f.currency) || 'MDL',
    amount_net: optAmount(f.amount_net),
    vat: optAmount(f.vat),
    amount_total: parseAmount(str(f.amount_total)),
    category: str(f.category),
    note: str(f.note),
  };
  const errors = [];
  if (!data.supplier || data.supplier.length > 200) errors.push('supplier');
  if (data.supplier_idno.length > 30) errors.push('supplier_idno');
  if (data.doc_number.length > 60) errors.push('doc_number');
  if (!validDay(data.doc_date)) errors.push('doc_date');
  if (!CURRENCIES.includes(data.currency)) errors.push('currency');
  if (data.amount_net === undefined) errors.push('amount_net');
  if (data.vat === undefined) errors.push('vat');
  if (data.amount_total === null) errors.push('amount_total');
  if (!EXPENSE_CATEGORIES[data.category]) errors.push('category');
  if (data.note.length > 1000) errors.push('note');
  if (data.vat === null) data.vat = 0;

  const raw = Array.isArray(f.items) ? f.items : [];
  if (raw.length > MAX_ITEMS) errors.push('items');
  const items = raw.slice(0, MAX_ITEMS).map((i, pos) => {
    const it = {
      pos,
      name: str(i && i.name),
      code: str(i && i.code).slice(0, 60),
      unit: str(i && i.unit).slice(0, 20),
      qty: str(i && i.qty) === '' ? null : parseQty(i.qty) ?? undefined,
      unit_price: optAmount(i && i.unit_price),
      line_total: optAmount(i && i.line_total),
    };
    if (!it.name || it.name.length > 300 || [it.qty, it.unit_price, it.line_total].includes(undefined)) errors.push('items');
    return it;
  });
  return errors.length ? { errors: [...new Set(errors)] } : { data, items };
}

// Același furnizor (fără litere mari/mici), același număr și aceeași dată; fără număr: și același total
async function findDuplicates(data, exceptId = null) {
  const rows = await rest(`expenses?select=id,supplier,doc_number,doc_date,amount_total,currency&doc_date=eq.${data.doc_date}`);
  const sup = data.supplier.toLowerCase();
  return rows.filter(r => String(r.id) !== String(exceptId) && r.supplier.toLowerCase() === sup &&
    (data.doc_number ? r.doc_number === data.doc_number : Number(r.amount_total) === data.amount_total));
}

async function saveItems(expenseId, items) {
  await rest(`expense_items?expense_id=eq.${expenseId}`, { method: 'DELETE' });
  if (items.length) {
    await rest('expense_items', { method: 'POST', body: items.map(i => ({ ...i, expense_id: expenseId })), prefer: 'return=minimal' });
  }
}

// Cheltuiala nouă; dacă articolele nu se salvează, nu rămâne o cheltuială pe jumătate
async function createExpense(data, items, source) {
  const [exp] = await rest('expenses', { method: 'POST', body: { ...data, source }, prefer: 'return=representation' });
  try {
    await saveItems(exp.id, items);
  } catch (e) {
    await rest(`expenses?id=eq.${exp.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return exp;
}

module.exports = { fieldsFromClaude, validate, findDuplicates, createExpense, saveItems };
