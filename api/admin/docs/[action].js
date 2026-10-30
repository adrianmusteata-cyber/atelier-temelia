/* Recunoașterea documentelor prin Claude: cărți de vizită și chestionare → CRM, avize și chitanțe → cheltuieli.
   POST /api/admin/docs/upload { files: [{ page, mime, size }] } → { token, uploads: [{ page, url }] }
        — linkuri semnate; browserul urcă fișierele direct în Storage, în tmp/<token>/
   POST /api/admin/docs/read   { token, doc_type? } → { doc_type, supported, fields, duplicates }
        — Claude stabilește tipul (sau îl primește forțat) și citește câmpurile
   POST /api/admin/docs/save   { token, doc_type, fields, force? } → { id } sau 409 { duplicates }
   POST /api/admin/docs/cancel { token } — șterge fișierele temporare
   GET  /api/admin/docs/open?id=<document> → { url } — link de citire valabil 5 minute */
const crypto = require('crypto');
const { rest } = require('../../_lib/db');
const { allow, jsonBody } = require('../../_lib/http');
const { requireAdmin } = require('../../_lib/auth');
const { TYPES, SERVICES, STATUSES, DOC_TYPES } = require('../../_lib/labels');
const { countHits, addHit } = require('../../_lib/rate');
const { readDocument } = require('../../_lib/claude');
const store = require('../../_lib/storage');
const expenses = require('../../_lib/expenses');

// Tipurile care devin cheltuieli; restul (carte de vizită, chestionar) devin clienți în CRM
const EXPENSE_TYPES = ['aviz', 'chitanta'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
const MAX_IMAGES = 5;
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const OCR_PER_HOUR = 30;
const LIMITS = { name: 100, phone: 30, email: 150, message: 5000, notes: 5000 };

const str = v => (typeof v === 'string' ? v.trim() : '');
const tmpDir = token => `tmp/${token}`;

/* ---------- Câmpurile pentru CRM ---------- */

// Din argumentele uneltei lui Claude → câmpurile ecranului de verificare
function toFields(docType, input) {
  const s = k => str(input[k]);
  const arr = k => (Array.isArray(input[k]) ? input[k].map(str).filter(Boolean) : []);
  const notes = [];
  const add = (label, v) => { if (v) notes.push(`${label}: ${v}`); };
  const f = { name: s('name'), phone: s('phone'), email: s('email'), type: '', service: '', message: '', notes: '' };

  if (docType === 'carte_vizita') {
    add('Firma', s('company'));
    add('Funcția', s('position'));
    add('Adresa', s('address'));
    add('Site', s('website'));
    add('Alte telefoane', arr('other_phones').join(', '));
    add('Alte emailuri', arr('other_emails').join(', '));
    add('Altele', s('other'));
  } else {
    f.type = TYPES[s('type')] ? s('type') : '';
    f.service = SERVICES[s('service')] ? s('service') : '';
    f.message = s('message');
    if (!f.type) add('Tip proiect (scris)', s('type_written'));
    if (!f.service) add('Serviciu (scris)', s('service_written'));
    (Array.isArray(input.answers) ? input.answers : []).forEach(a => a && add(str(a.question) || 'Răspuns', str(a.answer)));
  }
  // Un email greșit sau un telefon prea lung nu se pierd: ajung în note
  if (f.email && !EMAIL_RE.test(f.email)) { add('Email (citit)', f.email); f.email = ''; }
  if (f.phone.length > LIMITS.phone) { add('Telefon (citit)', f.phone); f.phone = f.phone.slice(0, LIMITS.phone); }
  f.notes = notes.join('\n');
  return f;
}

function validate(body) {
  const f = body && typeof body === 'object' ? body : {};
  const data = {};
  for (const k of ['name', 'phone', 'email', 'type', 'service', 'message', 'notes']) data[k] = str(f[k]);
  const errors = [];
  if (!data.name) errors.push('name');
  if (!data.phone && !data.email) errors.push('contact');
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('email');
  for (const [k, max] of Object.entries(LIMITS)) if (data[k].length > max) errors.push(k);
  if (data.type && !TYPES[data.type]) errors.push('type');
  if (data.service && !SERVICES[data.service]) errors.push('service');
  return errors.length ? { errors } : { data };
}

// Același email (fără diferență de litere) sau aceleași ultimele 8 cifre ale telefonului
const last8 = p => String(p || '').replace(/\D/g, '').slice(-8);
async function findDuplicates({ phone, email }) {
  const p = last8(phone), e = str(email).toLowerCase();
  if (p.length < 8 && !e) return [];
  const rows = await rest('requests?select=id,name,status,phone,email&order=created_at.desc&limit=5000');
  return rows
    .filter(r => (p.length === 8 && last8(r.phone) === p) || (e && str(r.email).toLowerCase() === e))
    .slice(0, 5)
    .map(r => ({ id: r.id, name: r.name, status: STATUSES[r.status] || r.status }));
}

/* ---------- Fișierele temporare ---------- */

async function tmpFiles(token) {
  const rows = await store.list(tmpDir(token));
  return rows.filter(r => r.id && /^\d\.(jpg|png|webp|pdf)$/.test(r.name))
    .map(r => ({ name: r.name, page: Number(r.name[0]), mime: MIME[r.name.split('.')[1]], size: Number(r.metadata?.size || 0) }));
}

async function dropTmp(token) {
  const files = await store.list(tmpDir(token)).catch(() => []);
  await store.remove(files.map(f => `${tmpDir(token)}/${f.name}`)).catch(() => {});
}

// Curățenie ocazională: încărcările abandonate mai vechi de o zi
async function sweepOld() {
  const dirs = (await store.list('tmp')).filter(d => !d.id && UUID_RE.test(d.name)).slice(0, 20);
  const old = Date.now() - 864e5;
  for (const d of dirs) {
    const files = await store.list(tmpDir(d.name));
    if (files.length && files.every(f => Date.parse(f.created_at) < old)) await dropTmp(d.name);
  }
}

// Numărul de pagini ale unui PDF, estimat fără bibliotecă
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

/* ---------- Acțiuni ---------- */

async function upload(body, res) {
  const files = Array.isArray(body.files) ? body.files : [];
  const pdf = files.some(f => f && f.mime === 'application/pdf');
  const okFile = f => f && EXT[f.mime] && Number.isInteger(f.size) && f.size > 0 &&
    f.size <= (f.mime === 'application/pdf' ? MAX_PDF : MAX_IMAGE);
  const pages = files.map(f => f && f.page);
  if (!files.length || files.length > (pdf ? 1 : MAX_IMAGES) || !files.every(okFile) ||
      new Set(pages).size !== files.length || !pages.every(p => Number.isInteger(p) && p >= 1 && p <= MAX_IMAGES)) {
    return res.status(400).json({ ok: false, error: 'files' });
  }
  const token = crypto.randomUUID();
  const uploads = await Promise.all(files.map(async f => ({
    page: f.page,
    url: await store.signUpload(`${tmpDir(token)}/${f.page}.${EXT[f.mime]}`),
  })));
  if (Math.random() < 0.1) await sweepOld().catch(e => console.error('Curățarea tmp a eșuat:', e.message));
  return res.status(200).json({ ok: true, token, uploads });
}

async function read(body, res) {
  const forced = body.doc_type ? String(body.doc_type) : null;
  if (forced && !DOC_TYPES[forced]) return res.status(400).json({ ok: false, error: 'doc_type' });

  const files = await tmpFiles(body.token);
  if (!files.length) return res.status(404).json({ ok: false, error: 'nofiles' });
  if (files.some(f => f.size > (f.mime === 'application/pdf' ? MAX_PDF : MAX_IMAGE))) {
    await dropTmp(body.token);
    return res.status(400).json({ ok: false, error: 'files' });
  }

  if (await countHits('ocr', 3600e3) >= OCR_PER_HOUR) return res.status(429).json({ ok: false, error: 'rate' });

  const pages = await Promise.all(files.map(async f => ({ mime: f.mime, data: await store.download(`${tmpDir(body.token)}/${f.name}`) })));
  if (pages[0].mime === 'application/pdf' && pdfPages(pages[0].data) > MAX_PDF_PAGES) {
    return res.status(400).json({ ok: false, error: 'pages' });
  }

  await addHit('ocr');
  let result;
  try {
    result = await readDocument(pages, forced);
  } catch (e) {
    console.error('Citirea cu Claude a eșuat:', e.message);
    // Detaliul (fără cheie) îl vede doar adminul, ca să se poată afla cauza fără jurnalele Vercel
    return res.status(502).json({ ok: false, error: 'claude', detail: e.message.slice(0, 300) });
  }

  if (!result.doc_type) {
    await dropTmp(body.token);
    return res.status(200).json({ ok: true, doc_type: null });
  }
  if (!DOC_TYPES[result.doc_type].ready) {
    return res.status(200).json({ ok: true, doc_type: result.doc_type, supported: false });
  }
  if (EXPENSE_TYPES.includes(result.doc_type)) {
    const fields = expenses.fieldsFromClaude(result.input);
    const check = expenses.validate(fields);
    const duplicates = check.data ? await expenses.findDuplicates(check.data) : [];
    return res.status(200).json({ ok: true, doc_type: result.doc_type, supported: true, fields, duplicates });
  }
  const fields = toFields(result.doc_type, result.input);
  const duplicates = await findDuplicates(fields);
  return res.status(200).json({ ok: true, doc_type: result.doc_type, supported: true, fields, duplicates });
}

async function save(body, res) {
  const docType = String(body.doc_type || '');
  if (!DOC_TYPES[docType] || !DOC_TYPES[docType].ready) return res.status(400).json({ ok: false, error: 'doc_type' });
  const isExpense = EXPENSE_TYPES.includes(docType);
  const lib = isExpense ? expenses : { validate, findDuplicates };
  const { data, items, errors } = lib.validate(body.fields);
  if (errors) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  if (!body.force) {
    const duplicates = await lib.findDuplicates(data);
    if (duplicates.length) return res.status(409).json({ ok: false, error: 'duplicate', duplicates });
  }

  let id, owner;
  if (isExpense) {
    id = (await expenses.createExpense(data, items, docType)).id;
    owner = { expense_id: id };
  } else {
    const [item] = await rest('requests', {
      method: 'POST',
      body: { ...data, status: 'noua', source: docType, channel: '' },
      prefer: 'return=representation',
    });
    id = item.id;
    owner = { request_id: id };
  }

  // Întâi înregistrarea, apoi fișierele: dacă pasul cu fișierele eșuează, înregistrarea rămâne
  try {
    await attachFiles(body.token, docType, id, owner);
  } catch (e) {
    console.error('Mutarea fișierelor documentului a eșuat:', e.message);
    return res.status(201).json({ ok: true, id, kind: isExpense ? 'expense' : 'client', filesError: true });
  }
  return res.status(201).json({ ok: true, id, kind: isExpense ? 'expense' : 'client' });
}

// Mută fișierele din tmp/<token>/ în <tip>/<id>/ și le leagă de înregistrare
async function attachFiles(token, docType, id, owner) {
  const files = await tmpFiles(token);
  for (const f of files) {
    const path = `${docType}/${id}/${f.name}`;
    await store.move(`${tmpDir(token)}/${f.name}`, path);
    await rest('documents', {
      method: 'POST',
      body: { doc_type: docType, ...owner, page: f.page, path, mime: f.mime, size_bytes: f.size },
      prefer: 'return=minimal',
    });
  }
}

async function open(req, res) {
  const id = String(req.query.id || '');
  if (!/^\d{1,18}$/.test(id)) return res.status(404).json({ ok: false, error: 'notfound' });
  const [doc] = await rest(`documents?select=path&id=eq.${id}`);
  if (!doc) return res.status(404).json({ ok: false, error: 'notfound' });
  return res.status(200).json({ ok: true, url: await store.signRead(doc.path, 300) });
}

module.exports = async function handler(req, res) {
  const action = String(req.query.action || '');
  if (!allow(req, res, action === 'open' ? ['GET'] : ['POST'])) return;
  if (!requireAdmin(req, res)) return;
  const body = jsonBody(req) || {};

  try {
    if (action === 'open') return await open(req, res);
    if (action === 'upload') return await upload(body, res);
    if (!['read', 'save', 'cancel'].includes(action)) return res.status(404).json({ ok: false, error: 'notfound' });
    if (!UUID_RE.test(String(body.token || ''))) return res.status(400).json({ ok: false, error: 'token' });
    if (action === 'read') return await read(body, res);
    if (action === 'save') return await save(body, res);
    await dropTmp(body.token);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(`Documente (${action}) a eșuat:`, e.message);
    return res.status(502).json({ ok: false, error: 'db', detail: e.message.slice(0, 300) });
  }
};
module.exports.toFields = toFields;
module.exports.validate = validate;
