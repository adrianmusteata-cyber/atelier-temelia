/* Fișierele documentelor în Supabase Storage (bucketul privat „documente”), fără dependențe.
   Browserul nu primește niciodată cheia: doar linkuri semnate, de încărcare sau de deschidere. */
const { config, authHeaders } = require('./db');

const BUCKET = 'documente';

async function storage(path, { method = 'GET', body, raw = false } = {}) {
  const { url, key } = config();
  const headers = authHeaders(key);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${url}/storage/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${await r.text()}`);
  if (raw) return Buffer.from(await r.arrayBuffer());
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

const enc = p => p.split('/').map(encodeURIComponent).join('/');

// Link pe care browserul face PUT direct (ocolește limita de ~4,5 MB a Vercel)
async function signUpload(path) {
  const { url } = config();
  const data = await storage(`object/upload/sign/${BUCKET}/${enc(path)}`, { method: 'POST', body: {} });
  return `${url}/storage/v1${data.url}`;
}

// Link de citire, valabil `seconds` secunde
async function signRead(path, seconds = 300) {
  const { url } = config();
  const data = await storage(`object/sign/${BUCKET}/${enc(path)}`, { method: 'POST', body: { expiresIn: seconds } });
  return `${url}/storage/v1${data.signedURL}`;
}

// Mai multe linkuri de citire dintr-un singur apel (miniaturile din lista vizualizărilor): { path: url }
async function signReadMany(paths, seconds = 300) {
  if (!paths.length) return {};
  const { url } = config();
  const rows = await storage(`object/sign/${BUCKET}`, { method: 'POST', body: { expiresIn: seconds, paths } });
  const out = {};
  (rows || []).forEach(r => { if (r && r.signedURL && !r.error) out[r.path] = `${url}/storage/v1${r.signedURL}`; });
  return out;
}

// Fișier scris direct de server (schița generată), fără link semnat
async function upload(path, data, mime) {
  const { url, key } = config();
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${enc(path)}`, {
    method: 'POST',
    headers: { ...authHeaders(key), 'Content-Type': mime, 'x-upsert': 'true' },
    body: data,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${await r.text()}`);
}

const download = path => storage(`object/${BUCKET}/${enc(path)}`, { raw: true });

// Fișierele dintr-un dosar: [{ name, created_at, metadata: { size, mimetype } }]
async function list(prefix) {
  const rows = await storage(`object/list/${BUCKET}`, {
    method: 'POST', body: { prefix, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } },
  });
  return rows || [];
}

const move = (from, to) => storage('object/move', { method: 'POST', body: { bucketId: BUCKET, sourceKey: from, destinationKey: to } });

const remove = paths => (paths.length
  ? storage(`object/${BUCKET}`, { method: 'DELETE', body: { prefixes: paths } })
  : Promise.resolve());

module.exports = { signUpload, signRead, signReadMany, upload, download, list, move, remove };
