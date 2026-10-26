/* Acces la Supabase prin REST (PostgREST), fără dependențe.
   Variabile: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (doar pe server). */

function config() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return { url: url.replace(/\/+$/, ''), key };
}

// path: de ex. 'requests?select=*&order=created_at.desc'
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  // Cheile vechi (service_role) sunt JWT și merg și în Authorization;
  // cheile noi (sb_secret_…) se trimit doar în antetul apikey
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    // Diagnostic temporar: doar forma cheii (prefix public + lungime), niciodată cheia
    const shape = `cheie: începe cu "${key.slice(0, 10)}", ${key.length} caractere, ghilimele: ${/["']/.test(key)}, spații: ${/\s/.test(key)}`;
    throw new Error(`Supabase ${r.status}: ${await r.text()} (${shape})`);
  }
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

module.exports = { rest };
