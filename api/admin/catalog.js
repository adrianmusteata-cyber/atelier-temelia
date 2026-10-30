/* Catalog: produsele furnizorilor, furnizorii și listele lor de prețuri (Etapa 4).
   O singură funcție (Vercel Hobby: cel mult 12), cu ținta aleasă prin parametri:
   GET    /api/admin/catalog?q=&supplier_id=&sort=name|price|date&cursor= → { items, next } — câte 50
   GET    /api/admin/catalog?id=<produs>                → produsul, cu furnizorul și istoricul prețurilor
   POST   /api/admin/catalog { supplier: { id } | { name, idno }, name, code, unit, price, currency } — produs manual
   PATCH  /api/admin/catalog?id=<produs> { name, code, unit, price, currency } — prețul schimbat intră în istoric
   DELETE /api/admin/catalog?id=<produs>                — cu tot istoricul lui
   POST   /api/admin/catalog?action=match { supplier_id, list_date, currency, rows } → stările rândurilor
   GET    /api/admin/catalog?suppliers=1                → toți furnizorii (pentru filtru și „Schimbă”)
   GET    /api/admin/catalog?supplier=<id>              → furnizorul, listele lui de prețuri și produsele
   PATCH  /api/admin/catalog?supplier=<id> { name, idno }
   DELETE /api/admin/catalog?supplier=<id>              → furnizorul cu produsele, listele și documentele lor
   DELETE /api/admin/catalog?list=<id>                  → lista de prețuri și documentul ei; produsele rămân */
const { rest } = require('../_lib/db');
const { allow, jsonBody } = require('../_lib/http');
const { requireAdmin } = require('../_lib/auth');
const { todayChisinau } = require('../_lib/money');
const catalog = require('../_lib/catalog');
const store = require('../_lib/storage');

const ID_RE = /^\d{1,18}$/;
const PAGE = 50;
const SORTS = { name: 'name.asc,id.asc', price: 'price.asc,name.asc,id.asc', date: 'price_date.desc,name.asc,id.asc' };
const notfound = res => res.status(404).json({ ok: false, error: 'notfound' });
const invalid = (res, fields) => res.status(400).json({ ok: false, error: 'invalid', fields });
const isUnique = e => /23505|duplicate key/.test(e.message);

/* ---------- Produse ---------- */

async function list(req, res) {
  // Fără caractere care au sens în filtrele PostgREST
  const q = String(req.query.q || '').replace(/[,()*%\\:."]/g, ' ').trim().slice(0, 60);
  const sid = ID_RE.test(String(req.query.supplier_id || '')) ? req.query.supplier_id : null;
  const offset = /^\d{1,6}$/.test(String(req.query.cursor || '')) ? Number(req.query.cursor) : 0;
  const order = SORTS[req.query.sort] || SORTS.name;
  let path = `products?select=id,code,name,unit,price,currency,price_date,supplier_id,suppliers(name)&order=${order}&limit=${PAGE + 1}&offset=${offset}`;
  if (sid) path += `&supplier_id=eq.${sid}`;
  if (q) path += `&or=(name.ilike.*${encodeURIComponent(q)}*,code.ilike.*${encodeURIComponent(q)}*)`;
  const rows = await rest(path);
  const items = rows.slice(0, PAGE).map(({ suppliers: s, ...p }) => ({ ...p, price: Number(p.price), supplier: s ? s.name : '' }));
  return res.status(200).json({ ok: true, items, next: rows.length > PAGE ? offset + PAGE : null });
}

async function product(id) {
  const [p] = await rest(`products?select=*,suppliers(id,name,idno)&id=eq.${id}`);
  if (!p) return null;
  const history = await rest(`price_history?select=id,price,currency,price_date,price_list_id,created_at,price_lists(id,list_date,documents(id,page,mime))` +
    `&product_id=eq.${id}&order=price_date.desc,id.desc`);
  const { suppliers: supplier, ...fields } = p;
  const docs = l => (l.documents || []).sort((a, b) => a.page - b.page);
  return {
    ...fields, price: Number(p.price), supplier,
    history: history.map(({ price_lists: l, ...h }) => ({ ...h, price: Number(h.price), list: l ? { id: l.id, list_date: l.list_date, documents: docs(l) } : null })),
  };
}

// Furnizorul ales sau unul nou (cu IDNO existent → acela)
async function supplierId(sup) {
  if (sup.id) {
    const [s] = await rest(`suppliers?select=id&id=eq.${sup.id}`);
    return s ? s.id : null;
  }
  const found = await catalog.findSupplier(sup);
  if (found) return found.id;
  const [s] = await rest('suppliers', { method: 'POST', body: { name: sup.name, idno: sup.idno || '' }, prefer: 'return=representation' });
  return s.id;
}

async function createProduct(body, res) {
  const { data, errors } = catalog.validateProduct(body);
  if (errors) return invalid(res, errors);
  const sid = await supplierId(data.supplier);
  if (!sid) return notfound(res);
  const day = todayChisinau();
  let p;
  try {
    [p] = await rest('products', {
      method: 'POST',
      body: { supplier_id: sid, code: data.code, name: data.name, unit: data.unit, price: data.price, currency: data.currency, price_date: day },
      prefer: 'return=representation',
    });
  } catch (e) {
    if (isUnique(e)) return res.status(409).json({ ok: false, error: 'exists' });
    throw e;
  }
  try {
    await rest('price_history', { method: 'POST', body: { product_id: p.id, price: data.price, currency: data.currency, price_date: day }, prefer: 'return=minimal' });
  } catch (e) {
    // Fără istoric nu rămâne un produs pe jumătate
    await rest(`products?id=eq.${p.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return res.status(201).json({ ok: true, item: await product(p.id) });
}

async function updateProduct(id, body, res) {
  const { data, errors } = catalog.validateProduct(body, { partial: true });
  if (errors) return invalid(res, errors);
  const [cur] = await rest(`products?select=id,price,currency&id=eq.${id}`);
  if (!cur) return notfound(res);
  const changed = Number(cur.price) !== data.price || cur.currency !== data.currency;
  const day = todayChisinau();
  const patch = { ...data, updated_at: new Date().toISOString(), ...(changed ? { price_date: day } : {}) };
  try {
    await rest(`products?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
  } catch (e) {
    if (isUnique(e)) return res.status(409).json({ ok: false, error: 'exists' });
    throw e;
  }
  // Prețul schimbat manual intră în istoric, fără listă
  if (changed) await rest('price_history', { method: 'POST', body: { product_id: Number(id), price: data.price, currency: data.currency, price_date: day }, prefer: 'return=minimal' });
  return res.status(200).json({ ok: true, item: await product(id) });
}

/* ---------- Furnizori și liste de prețuri ---------- */

async function supplierPage(id, res) {
  const [s] = await rest(`suppliers?select=id,name,idno,created_at&id=eq.${id}`);
  if (!s) return notfound(res);
  const lists = await rest(`price_lists?select=id,list_date,currency,rows_count,note,created_at,documents(id,page,mime)` +
    `&supplier_id=eq.${id}&order=list_date.desc,id.desc&documents.order=page.asc`);
  const products = await rest(`products?select=id,code,name,unit,price,currency,price_date,last_list_id&supplier_id=eq.${id}&order=name.asc,id.asc&limit=5000`);
  // „Nu apare în ultima listă”: ultima listă (după dată) nu i-a dat prețul actual
  const last = lists[0] ? lists[0].id : null;
  const items = products.map(p => ({ ...p, price: Number(p.price), not_in_last: !!last && p.last_list_id !== last }));
  return res.status(200).json({ ok: true, item: { ...s, lists, products: items } });
}

async function deleteSupplier(id, res) {
  const lists = await rest(`price_lists?select=id,documents(path)&supplier_id=eq.${id}`);
  const [s] = await rest(`suppliers?select=id&id=eq.${id}`);
  if (!s) return notfound(res);
  // Produsele, istoricul, listele și rândurile din documents se șterg în cascadă
  await rest(`suppliers?id=eq.${id}`, { method: 'DELETE' });
  await store.remove(lists.flatMap(l => l.documents.map(d => d.path))).catch(e => console.error('Ștergerea fișierelor a eșuat:', e.message));
  return res.status(200).json({ ok: true });
}

async function deleteList(id, res) {
  const [l] = await rest(`price_lists?select=id,supplier_id,documents(path)&id=eq.${id}`);
  if (!l) return notfound(res);
  // Produsele rămân; istoricul pierde doar legătura cu lista; documentul se șterge în cascadă
  await rest(`price_lists?id=eq.${id}`, { method: 'DELETE' });
  await store.remove(l.documents.map(d => d.path)).catch(e => console.error('Ștergerea fișierelor a eșuat:', e.message));
  return res.status(200).json({ ok: true, supplier_id: l.supplier_id });
}

/* ---------- Potrivirea rândurilor (ecranul de verificare) ---------- */

async function match(body, res) {
  const sid = body.supplier_id === null || body.supplier_id === undefined || body.supplier_id === '' ? null : String(body.supplier_id);
  if (sid !== null && !ID_RE.test(sid)) return notfound(res);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > catalog.MAX_ROWS) return invalid(res, ['too_many']);
  const out = await catalog.matchFor(sid, rows, { list_date: String(body.list_date || ''), currency: String(body.currency || 'MDL') });
  return res.status(200).json({ ok: true, ...out });
}

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;
  const body = jsonBody(req) || {};
  const q = req.query;
  const pick = k => (q[k] === undefined ? null : String(q[k]));
  const id = pick('id'), sup = pick('supplier'), lst = pick('list');
  for (const v of [id, sup, lst]) if (v !== null && !ID_RE.test(v)) return notfound(res);

  try {
    if (req.method === 'POST' && q.action === 'match') return await match(body, res);
    if (req.method === 'GET' && q.suppliers) return res.status(200).json({ ok: true, items: await catalog.allSuppliers() });

    if (lst) {
      if (req.method !== 'DELETE') return notfound(res);
      return await deleteList(lst, res);
    }
    if (sup) {
      if (req.method === 'GET') return await supplierPage(sup, res);
      if (req.method === 'DELETE') return await deleteSupplier(sup, res);
      if (req.method !== 'PATCH') return notfound(res);
      const { data, errors } = catalog.validateSupplier(body);
      if (errors) return invalid(res, errors);
      try {
        const [s] = await rest(`suppliers?id=eq.${sup}`, { method: 'PATCH', body: data, prefer: 'return=representation' });
        if (!s) return notfound(res);
      } catch (e) {
        if (isUnique(e)) return res.status(409).json({ ok: false, error: 'exists' });
        throw e;
      }
      return await supplierPage(sup, res);
    }

    if (req.method === 'GET') {
      if (!id) return await list(req, res);
      const item = await product(id);
      return item ? res.status(200).json({ ok: true, item }) : notfound(res);
    }
    if (req.method === 'POST') return id ? notfound(res) : await createProduct(body, res);
    if (!id) return notfound(res);
    if (req.method === 'PATCH') return await updateProduct(id, body, res);
    const [p] = await rest(`products?select=id,supplier_id&id=eq.${id}`);
    if (!p) return notfound(res);
    await rest(`products?id=eq.${id}`, { method: 'DELETE' }); // istoricul se șterge în cascadă
    return res.status(200).json({ ok: true, supplier_id: p.supplier_id });
  } catch (e) {
    console.error('Operația pe catalog a eșuat:', e.message);
    return res.status(502).json({ ok: false, error: 'db', detail: e.message.slice(0, 300) });
  }
};
