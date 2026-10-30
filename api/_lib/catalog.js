/* Catalog (Etapa 4): furnizori, produse și prețuri din listele de prețuri.
   Potrivirea rândurilor unei liste cu produsele furnizorului (funcții pure, testabile fără bază),
   câmpurile citite de Claude, validarea și importul atomic (funcția SQL import_price_list). */
const { rest } = require('./db');
const { CURRENCIES, parseAmount, validDate, todayChisinau } = require('./money');

const MAX_ROWS = 1000;
const LIMITS = { name: 300, code: 50, unit: 50, supplier: 200, idno: 30, note: 1000 };
const BIG_CHANGE = 50; // % — o schimbare mai mare poate fi o cifră citită greșit
const NEAR = 2; // distanța Levenshtein maximă pentru „denumire asemănătoare”

const str = v => (v === null || v === undefined ? '' : String(v).trim());
const oneSpace = v => str(v).replace(/\s+/g, ' ');
// Codurile: fără litere mari/mici și fără spații; denumirile: fără litere mari/mici, spațiile reduse la unul
const normCode = v => str(v).toLowerCase().replace(/\s+/g, '');
const normName = v => oneSpace(v).toLowerCase();
// Denumirea fără semne de punctuație, pentru „denumire asemănătoare”
const looseName = v => normName(v).replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const round1 = x => Math.round(x * 10) / 10;
const priceText = v => {
  if (v === null || v === undefined || v === '') return '';
  const x = Number(String(v).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? String(Math.round(x * 100) / 100) : str(v);
};

/* Distanța Levenshtein, calculată doar în banda |i − j| ≤ max: întoarce max + 1 dacă e mai mare.
   Așa, compararea cu câteva sute de produse ale furnizorului rămâne rapidă. */
function levenshtein(a, b, max = NEAR) {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array(m + 1);
  for (let i = 1; i <= n; i++) {
    cur.fill(max + 1);
    cur[0] = i;
    let best = i <= max ? i : max + 1;
    for (let j = Math.max(1, i - max); j <= Math.min(m, i + max); j++) {
      cur[j] = Math.min(prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), prev[j] + 1, cur[j - 1] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return Math.min(prev[m], max + 1);
}

// Produsul cu denumirea cea mai apropiată: identică fără punctuație, distanța ≤ 2 sau una o conține pe cealaltă
function nearestByName(name, loose) {
  const l = looseName(name);
  if (!l) return null;
  let best = null, bestScore = Infinity;
  for (const { p, l: pl } of loose) {
    let score;
    if (pl === l) score = 0;
    else {
      const d = levenshtein(l, pl);
      // „Conține” doar la denumiri de cel puțin 4 litere: altfel „Cui” ar semăna cu orice
      score = d <= NEAR ? d : Math.min(l.length, pl.length) >= 4 && (pl.includes(l) || l.includes(pl)) ? NEAR + 0.5 : Infinity;
    }
    if (score < bestScore) { best = p; bestScore = score; }
    if (score === 0) break;
  }
  return best;
}

const brief = p => p && { id: p.id, name: p.name, code: p.code, unit: p.unit, price: Number(p.price), currency: p.currency, price_date: p.price_date };

/* Rândurile listei comparate cu produsele aceluiași furnizor.
   rows: [{ code, name, unit, price, uncertain }]; products: produsele furnizorului (gol = furnizor nou);
   opts: { list_date, currency }.
   Fiecare rând primește: status (new | changed | same | uncertain), match_product_id și match
   (produsul găsit sau propus), old_price, old_currency, diff_pct, reason, older, currency_note, error. */
function matchRows(rows, products, { list_date: listDate, currency } = {}) {
  const byCode = new Map(), byNameNoCode = new Map(), byName = new Map();
  for (const p of products) {
    if (str(p.code)) byCode.set(normCode(p.code), p);
    else byNameNoCode.set(normName(p.name), p);
    if (!byName.has(normName(p.name))) byName.set(normName(p.name), p);
  }
  const loose = products.map(p => ({ p, l: looseName(p.name) }));

  const out = rows.map(raw => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const row = { code: str(r.code), name: oneSpace(r.name), unit: str(r.unit), price: priceText(r.price), uncertain: r.uncertain === true, off: r.include === false };
    const nm = normName(row.name), cd = normCode(row.code);
    const price = parseAmount(row.price);
    const reasons = [];
    let cand = null, sure = false, error = '';

    if (!nm) error = 'Lipsește denumirea';
    else if (row.name.length > LIMITS.name) error = 'Denumirea are peste 300 de caractere';
    else if (row.code.length > LIMITS.code || row.unit.length > LIMITS.unit) error = 'Codul sau unitatea au peste 50 de caractere';
    else if (price === null) error = 'Lipsește prețul sau nu e valid';

    if (nm && cd) {
      cand = byCode.get(cd) || null;
      sure = !!cand;
      if (!cand && byName.has(nm)) {
        cand = byName.get(nm);
        reasons.push(`Cod nou, dar denumirea există deja: ${cand.name}${cand.code ? ` (cod ${cand.code})` : ''}`);
      }
    } else if (nm) {
      cand = byNameNoCode.get(nm) || null;
      sure = !!cand;
      if (!cand) {
        cand = nearestByName(row.name, loose);
        if (cand) reasons.push(`Denumire asemănătoare cu: ${cand.name}${cand.code ? ` (cod ${cand.code})` : ''}`);
      }
    }
    if (row.uncertain) reasons.push('Citit neclar — verifică rândul');

    const info = { old_price: null, old_currency: '', diff_pct: null, older: false, currency_note: '' };
    if (cand && price !== null) {
      info.old_price = Number(cand.price);
      info.old_currency = cand.currency;
      if (cand.currency === currency) info.diff_pct = round1(((price - info.old_price) / info.old_price) * 100);
      info.older = !!listDate && listDate < cand.price_date;
      if (cand.currency !== currency && !info.older) info.currency_note = `Moneda produsului se schimbă din ${cand.currency} în ${currency}`;
      if (sure && info.diff_pct !== null && Math.abs(info.diff_pct) > BIG_CHANGE) {
        reasons.push(`Preț schimbat cu ${info.diff_pct > 0 ? '+' : ''}${info.diff_pct}%, verifică`);
      }
    }
    const base = !sure ? 'new' : price !== null && price === info.old_price && cand.currency === currency ? 'same' : 'changed';
    return {
      ...row, ...info, base,
      status: reasons.length ? 'uncertain' : base,
      match_product_id: cand ? cand.id : null,
      match: brief(cand),
      sure,
      reason: reasons.join('; '),
      error,
    };
  });

  // Două rânduri (bifate) care dau peste același produs: amândouă devin nesigure
  const byTarget = new Map();
  out.forEach((o, i) => { if (o.sure && !o.error && !o.off) byTarget.set(o.match_product_id, [...(byTarget.get(o.match_product_id) || []), i]); });
  for (const list of byTarget.values()) {
    if (list.length < 2) continue;
    list.forEach(i => {
      const o = out[i];
      const others = list.filter(j => j !== i).map(j => j + 1).join(', ');
      o.reason = [o.reason, `Același produs ca rândul ${others}`].filter(Boolean).join('; ');
      o.status = 'uncertain';
    });
  }
  // Rânduri noi dublate în listă (același cod / aceeași denumire): al doilea nu se poate include
  const seen = new Map();
  out.forEach((o, i) => {
    if (o.status !== 'new' || o.error || o.off) return;
    const key = newKey(o);
    if (seen.has(key)) o.error = `Rând dublat în listă (ca rândul ${seen.get(key) + 1}) — debifează-l`;
    else seen.set(key, i);
  });
  return out.map(({ sure, off, ...o }) => o);
}

// Cheia unui produs nou: codul, sau denumirea dacă nu are cod (ca indicii unice din baza de date)
const newKey = r => (normCode(r.code) ? `c:${normCode(r.code)}` : `n:${normName(r.name)}`);

/* Rezumatul de sus al ecranului de verificare */
function summary(rows) {
  const c = { total: rows.length, new: 0, changed: 0, same: 0, uncertain: 0 };
  rows.forEach(r => { c[r.status] += 1; });
  return c;
}

/* ---------- Câmpurile citite de Claude ---------- */

function isoDate(v) {
  const s = str(v);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : s;
  return validDate(iso) ? iso : '';
}

function fieldsFromClaude(input) {
  const s = k => str(input[k]);
  const notes = [];
  let currency = s('currency').toUpperCase();
  if (['LEI', 'MDL', ''].includes(currency)) currency = 'MDL';
  if (!CURRENCIES.includes(currency)) { notes.push(`Moneda pe listă: ${currency}`); currency = 'MDL'; }
  const date = isoDate(s('list_date'));
  if (!date && s('list_date')) notes.push(`Data pe listă: ${s('list_date')}`);
  if (input.prices_with_vat === true) notes.push('Prețuri cu TVA');
  let rows = (Array.isArray(input.rows) ? input.rows : []).filter(r => r && (str(r.name) || str(r.code) || str(r.price)));
  if (rows.length > MAX_ROWS) { notes.push(`Lista are ${rows.length} rânduri; s-au păstrat primele ${MAX_ROWS}.`); rows = rows.slice(0, MAX_ROWS); }
  return {
    supplier: s('supplier').slice(0, LIMITS.supplier),
    supplier_idno: s('supplier_idno').slice(0, LIMITS.idno),
    list_date: date || todayChisinau(),
    currency,
    note: notes.join('\n'),
    rows: rows.map(r => ({ code: str(r.code), name: oneSpace(r.name), unit: str(r.unit), price: priceText(r.price), uncertain: r.uncertain === true })),
  };
}

/* ---------- Validarea importului ---------- */

const ID_RE = /^\d{1,18}$/;

/* f: { supplier: { id } | { name, idno }, list_date, currency, note, rows: [{ include, code, name, unit, price, resolve }] }
   Întoarce { data, rows } (doar rândurile bifate, cu poziția lor din listă) sau { errors, rows: [poziții greșite] } */
function validateImport(f) {
  const body = f && typeof f === 'object' ? f : {};
  const errors = [];
  const sup = body.supplier && typeof body.supplier === 'object' ? body.supplier : {};
  const supplier = ID_RE.test(str(sup.id)) ? { id: Number(sup.id) } : { name: oneSpace(sup.name), idno: str(sup.idno) };
  if (!supplier.id && (!supplier.name || supplier.name.length > LIMITS.supplier)) errors.push('supplier');
  if (!supplier.id && supplier.idno.length > LIMITS.idno) errors.push('supplier_idno');
  const data = { supplier, list_date: str(body.list_date), currency: str(body.currency), note: str(body.note) };
  if (!validDate(data.list_date)) errors.push('list_date');
  if (!CURRENCIES.includes(data.currency)) errors.push('currency');
  if (data.note.length > LIMITS.note) errors.push('note');

  const raw = Array.isArray(body.rows) ? body.rows : [];
  if (raw.length > MAX_ROWS) errors.push('too_many');
  const bad = [];
  const rows = [];
  raw.slice(0, MAX_ROWS).forEach((r, pos) => {
    if (!r || typeof r !== 'object' || r.include === false) return;
    const row = { pos, code: str(r.code), name: oneSpace(r.name), unit: str(r.unit), price: parseAmount(str(r.price)), resolve: str(r.resolve) };
    if (!row.name || row.name.length > LIMITS.name || row.code.length > LIMITS.code || row.unit.length > LIMITS.unit ||
        row.price === null || (row.resolve && row.resolve !== 'new' && !ID_RE.test(row.resolve))) bad.push(pos + 1);
    rows.push(row);
  });
  if (bad.length) errors.push('rows');
  if (!rows.length && !errors.includes('too_many')) errors.push('no_rows');
  return errors.length ? { errors, rows: bad } : { data, rows };
}

/* Produsul fiecărui rând bifat: potrivirea serverului pentru rândurile sigure, alegerea utilizatorului
   („resolve”: id sau 'new') pentru cele nesigure. Întoarce { rows: [{ product_id, … }] } sau { error, rows }. */
function planImport(rows, products, opts) {
  const matched = matchRows(rows, products, opts);
  const byId = new Map(products.map(p => [String(p.id), p]));
  const unresolved = [], wrong = [], plan = [];
  matched.forEach((m, k) => {
    const r = rows[k];
    if (m.error) return wrong.push(r.pos + 1);
    // Alegerea utilizatorului (trimisă doar la rândurile pe care le-a văzut nesigure) are întâietate
    let productId = null;
    if (r.resolve === 'new') productId = null;
    else if (r.resolve) {
      if (!byId.has(r.resolve)) return wrong.push(r.pos + 1);
      productId = Number(r.resolve);
    } else if (m.status === 'uncertain') return unresolved.push(r.pos + 1);
    else if (m.status !== 'new') productId = m.match_product_id;
    plan.push({ pos: r.pos, product_id: productId, code: r.code, name: r.name, unit: r.unit, price: r.price });
  });
  if (wrong.length) return { error: 'rows', rows: wrong };
  if (unresolved.length) return { error: 'unresolved', rows: unresolved };

  // Același produs de două ori în import
  const targets = new Map();
  plan.filter(p => p.product_id).forEach(p => targets.set(p.product_id, [...(targets.get(p.product_id) || []), p.pos + 1]));
  const twice = [...targets.values()].filter(l => l.length > 1).flat();
  if (twice.length) return { error: 'dup_target', rows: twice };

  // Produs nou cu un cod (sau, fără cod, o denumire) care există deja la furnizor sau e de două ori în import
  const taken = new Set(products.map(p => (str(p.code) ? `c:${normCode(p.code)}` : `n:${normName(p.name)}`)));
  const conflict = [];
  plan.filter(p => !p.product_id).forEach(p => {
    const key = newKey(p);
    if (taken.has(key)) conflict.push(p.pos + 1);
    taken.add(key);
  });
  if (conflict.length) return { error: 'conflict', rows: conflict };
  return { rows: plan };
}

/* ---------- Baza de date ---------- */

const PRODUCT_FIELDS = 'id,supplier_id,code,name,unit,price,currency,price_date,last_list_id';
const supplierProducts = id => rest(`products?select=${PRODUCT_FIELDS}&supplier_id=eq.${id}&order=id.asc&limit=10000`);
const allSuppliers = () => rest('suppliers?select=id,name,idno&order=name.asc&limit=5000');

// Furnizorul după IDNO; dacă IDNO lipsește (sau nu e găsit), după numele exact al unui furnizor fără IDNO
async function findSupplier({ name, idno }) {
  const list = await allSuppliers();
  const id = str(idno), nm = normName(name);
  if (id) {
    const hit = list.find(s => s.idno === id);
    if (hit) return hit;
  }
  return (nm && list.find(s => normName(s.name) === nm && (!id || !s.idno))) || null;
}

// Aceeași listă încărcată din nou: același furnizor, aceeași dată și același număr de rânduri
async function sameList(supplierId, listDate, count) {
  if (!supplierId || !validDate(listDate)) return null;
  const [hit] = await rest(`price_lists?select=id,list_date&supplier_id=eq.${supplierId}&list_date=eq.${listDate}&rows_count=eq.${count}&limit=1`);
  return hit ? hit.list_date : null;
}

// Stările rândurilor pentru furnizorul ales (null = furnizor nou, fără produse)
async function matchFor(supplierId, rows, opts) {
  const products = supplierId ? await supplierProducts(supplierId) : [];
  const out = matchRows(rows, products, opts);
  return { rows: out, summary: summary(out), same_list: await sameList(supplierId, opts.list_date, rows.length) };
}

// Ce primește ecranul de verificare după citire
async function reviewFields(input) {
  const f = fieldsFromClaude(input);
  const sup = f.supplier || f.supplier_idno ? await findSupplier({ name: f.supplier, idno: f.supplier_idno }) : null;
  const m = await matchFor(sup && sup.id, f.rows, f);
  return { ...f, supplier_match: sup, rows: m.rows, summary: m.summary, same_list: m.same_list };
}

/* Importul: validare, potrivire, apoi funcția SQL (furnizor + listă + produse + istoric, totul sau nimic).
   Întoarce { result } sau { status, body } pentru eroare. */
async function importList(fields) {
  const v = validateImport(fields);
  if (v.errors) return { status: 400, body: { ok: false, error: 'invalid', fields: v.errors, rows: v.rows } };
  const { data } = v;
  let products = [];
  if (data.supplier.id) {
    const [sup] = await rest(`suppliers?select=id&id=eq.${data.supplier.id}`);
    if (!sup) return { status: 404, body: { ok: false, error: 'notfound' } };
    products = await supplierProducts(data.supplier.id);
  }
  const plan = planImport(v.rows, products, data);
  if (plan.error) return { status: 400, body: { ok: false, error: plan.error, rows: plan.rows } };
  try {
    const result = await rest('rpc/import_price_list', {
      method: 'POST',
      body: {
        p: {
          supplier_id: data.supplier.id || null,
          supplier_name: data.supplier.name || '',
          supplier_idno: data.supplier.idno || '',
          list_date: data.list_date,
          currency: data.currency,
          note: data.note,
          rows: plan.rows.map(({ pos, ...r }) => r),
        },
      },
    });
    return { result };
  } catch (e) {
    // Un produs creat între timp cu același cod / aceeași denumire
    if (/23505|duplicate key/.test(e.message)) return { status: 400, body: { ok: false, error: 'conflict', rows: [] } };
    if (/notfound|product /.test(e.message)) return { status: 404, body: { ok: false, error: 'notfound' } };
    throw e;
  }
}

/* ---------- Produs adăugat sau modificat manual ---------- */

function validateProduct(body, { partial = false } = {}) {
  const f = body && typeof body === 'object' ? body : {};
  const data = { code: str(f.code), name: oneSpace(f.name), unit: str(f.unit), price: parseAmount(str(f.price)), currency: str(f.currency) || 'MDL' };
  const errors = [];
  if (!data.name || data.name.length > LIMITS.name) errors.push('name');
  if (data.code.length > LIMITS.code) errors.push('code');
  if (data.unit.length > LIMITS.unit) errors.push('unit');
  if (data.price === null) errors.push('price');
  if (!CURRENCIES.includes(data.currency)) errors.push('currency');
  if (!partial) {
    const sup = f.supplier && typeof f.supplier === 'object' ? f.supplier : {};
    data.supplier = ID_RE.test(str(sup.id)) ? { id: Number(sup.id) } : { name: oneSpace(sup.name), idno: str(sup.idno) };
    if (!data.supplier.id && (!data.supplier.name || data.supplier.name.length > LIMITS.supplier)) errors.push('supplier');
    if (!data.supplier.id && data.supplier.idno.length > LIMITS.idno) errors.push('supplier_idno');
  }
  return errors.length ? { errors } : { data };
}

function validateSupplier(body) {
  const f = body && typeof body === 'object' ? body : {};
  const data = { name: oneSpace(f.name), idno: str(f.idno) };
  const errors = [];
  if (!data.name || data.name.length > LIMITS.supplier) errors.push('name');
  if (data.idno.length > LIMITS.idno) errors.push('idno');
  return errors.length ? { errors } : { data };
}

module.exports = {
  MAX_ROWS, levenshtein, normCode, normName, looseName, matchRows, summary, fieldsFromClaude,
  validateImport, planImport, findSupplier, allSuppliers, supplierProducts, matchFor, reviewFields, importList,
  validateProduct, validateSupplier, sameList,
};
