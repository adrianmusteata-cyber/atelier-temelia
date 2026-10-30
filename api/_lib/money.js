/* Sume și date pentru plăți */

const CURRENCIES = ['MDL', 'EUR'];
const MAX = 99999999.99;

// „3 000,50”, „3000.5” sau 3000.5 → 3000.5; orice altceva (sau ≤ 0, dacă nu e permis zero) → null
function parseAmount(v, { allowZero = false } = {}) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > MAX || n < 0 || (!allowZero && n === 0) ? null : n;
}

// Ziua de azi la Chișinău, ca YYYY-MM-DD
const todayChisinau = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });

// Data plății: YYYY-MM-DD, validă și nu în viitor
function validDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v && v <= todayChisinau();
}

// Orice dată reală YYYY-MM-DD (scadențele pot fi și în viitor, și în trecut)
function validDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
}

// Zile între două date YYYY-MM-DD (b − a)
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

module.exports = { CURRENCIES, parseAmount, validDay, validDate, daysBetween, todayChisinau };
