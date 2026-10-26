/* Sesiunea de administrare: un cookie semnat cu ADMIN_SECRET, valabil 7 zile.
   Parola vine din ADMIN_PASSWORD. Nu există utilizatori: o singură parolă. */
const crypto = require('crypto');
const { cookies } = require('./http');

const COOKIE = 'temelia_admin';
const MAX_AGE = 7 * 24 * 3600; // secunde

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s || s.length < 12) throw new Error('ADMIN_SECRET lipsește sau e prea scurt (minimum 12 caractere)');
  return s;
}

const sign = exp => crypto.createHmac('sha256', secret()).update(String(exp)).digest('base64url');

// Comparație în timp constant (pe amprente de aceeași lungime)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkPassword(pw) {
  // Spațiile de la capete (copiate din greșeală) nu contează
  const expected = (process.env.ADMIN_PASSWORD || '').trim();
  if (!expected) throw new Error('ADMIN_PASSWORD lipsește');
  return typeof pw === 'string' && safeEqual(pw.trim(), expected);
}

function setSession(res) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

function isAuthed(req) {
  const [exp, sig] = (cookies(req)[COOKIE] || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  try { return safeEqual(sig, sign(exp)); } catch (e) { return false; }
}

// Folosit de toate rutele /api/admin/*: fără sesiune → 401, fără date
function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (isAuthed(req)) return true;
  res.status(401).json({ ok: false, error: 'auth' });
  return false;
}

module.exports = { checkPassword, setSession, clearSession, isAuthed, requireAdmin };
