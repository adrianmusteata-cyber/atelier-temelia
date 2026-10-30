/* Sesiunea de administrare: un cookie semnat cu ADMIN_SECRET, valabil 7 zile.
   Parola vine din ADMIN_PASSWORD. Nu există utilizatori: o singură parolă.
   În Mini App Telegram nu există cookie: fiecare cerere aduce în antetul X-Telegram-Init-Data
   datele semnate de Telegram (initData), verificate cu tokenul botului nou (TELEGRAM_APP_BOT_TOKEN).
   Rolul vine din listele TG_OWNER_IDS (proprietar: tot panoul) și TG_STAFF_IDS (angajat: pâlnia și scanerul). */
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

/* ---------- Mini App Telegram ---------- */

const TG_HEADER = 'x-telegram-init-data';
const TG_MAX_AGE = 24 * 3600; // secunde: initData mai vechi de o zi nu mai e primit
const appToken = (env = process.env) => String(env.TELEGRAM_APP_BOT_TOKEN || '').trim();

// „111, 222,abc” → Set { '111', '222' }: spațiile și valorile nenumerice se ignoră
const idList = v => new Set(String(v || '').split(',').map(s => s.trim()).filter(s => /^\d{1,20}$/.test(s)));

/* Verificarea după documentația Telegram WebApp:
   secret = HMAC_SHA256(cheie "WebAppData", tokenul botului);
   hash   = HMAC_SHA256(cheie secret, data_check_string), unde data_check_string = perechile cheie=valoare
   (toate, fără hash), sortate după cheie și unite cu \n. Întoarce { user } sau { error: 'tg_bad' | 'tg_expired' }. */
function verifyInitData(raw, token, now = Date.now()) {
  if (typeof raw !== 'string' || !raw || raw.length > 8192) return { error: 'tg_bad' };
  const params = new URLSearchParams(raw);
  const hash = params.get('hash') || '';
  if (!/^[0-9a-f]{64}$/i.test(hash)) return { error: 'tg_bad' };
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(check).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return { error: 'tg_bad' };
  // Abia după semnătură: data și utilizatorul vin de la Telegram, nu de la cine a trimis cererea
  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { error: 'tg_bad' };
  const age = now / 1000 - authDate;
  if (age > TG_MAX_AGE || age < -300) return { error: 'tg_expired' }; // 5 minute toleranță pentru ceas
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch (e) { return { error: 'tg_bad' }; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { error: 'tg_bad' };
  return { user };
}

// Rolul din initData: proprietar (chiar dacă e și în lista angajaților), angajat sau refuzat.
// Întoarce { role, id } sau { status, error, tg_id? }
function telegramRole(raw, env = process.env, now = Date.now()) {
  const token = appToken(env);
  if (!token) return { status: 500, error: 'tg_config' };
  const { user, error } = verifyInitData(raw, token, now);
  if (error) return { status: 401, error };
  const id = String(user.id);
  if (idList(env.TG_OWNER_IDS).has(id)) return { role: 'owner', id };
  if (idList(env.TG_STAFF_IDS).has(id)) return { role: 'staff', id };
  // ID-ul e semnat de Telegram, deci e chiar al lui: îl poate trimite proprietarului
  return { status: 403, error: 'tg_denied', tg_id: id };
}

/* Folosit de toate rutele /api/admin/*. Întoarce rolul ('owner' | 'staff') sau false, după ce a răspuns cu eroarea.
   Implicit rutele sunt doar pentru proprietar; { staff: true } le deschide și angajaților.
   Cu antetul Telegram contează doar Telegramul; fără el, cookie-ul cu parola (= proprietar), ca până acum. */
function requireAdmin(req, res, { staff = false } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  const raw = req.headers[TG_HEADER];
  // Fără antet, sau fără token (calea Telegram oprită) dar cu sesiunea cu parola: proprietar
  if ((!raw || !appToken()) && isAuthed(req)) return 'owner';
  if (!raw) {
    res.status(401).json({ ok: false, error: 'auth' });
    return false;
  }
  const r = telegramRole(String(raw));
  if (r.error) {
    res.status(r.status).json({ ok: false, error: r.error, ...(r.tg_id ? { tg_id: r.tg_id } : {}) });
    return false;
  }
  if (r.role === 'staff' && !staff) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return false;
  }
  req.tgUser = { id: r.id, role: r.role };
  return r.role;
}

module.exports = { checkPassword, setSession, clearSession, isAuthed, requireAdmin, verifyInitData, telegramRole };
