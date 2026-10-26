/* Limite simple, ținute în tabelul rate_hits din Supabase */
const { rest } = require('./db');

// Câte înregistrări are cheia în ultimele `windowMs` milisecunde
async function countHits(key, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const rows = await rest(`rate_hits?select=id&key=eq.${encodeURIComponent(key)}&at=gt.${encodeURIComponent(since)}`);
  return rows.length;
}

async function addHit(key) {
  await rest('rate_hits', { method: 'POST', body: { key }, prefer: 'return=minimal' });
  // Curățenie ocazională: contoarele mai vechi de o zi nu mai trebuie
  if (Math.random() < 0.1) {
    const old = new Date(Date.now() - 864e5).toISOString();
    await rest(`rate_hits?at=lt.${encodeURIComponent(old)}`, { method: 'DELETE' }).catch(() => {});
  }
}

async function clearHits(key) {
  await rest(`rate_hits?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
}

module.exports = { countHits, addHit, clearHits };
