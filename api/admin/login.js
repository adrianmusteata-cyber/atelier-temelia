/* POST /api/admin/login { password } — deschide sesiunea de administrare.
   Maximum 5 parole greșite în 15 minute de pe același IP. */
const { jsonBody, ipKey, allow } = require('../_lib/http');
const { checkPassword, setSession } = require('../_lib/auth');
const { countHits, addHit, clearHits } = require('../_lib/rate');

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  res.setHeader('Cache-Control', 'no-store');
  const key = ipKey('login', req);
  try {
    if (await countHits(key, WINDOW_MS) >= MAX_FAILS) return res.status(429).json({ ok: false, error: 'rate' });
    const body = jsonBody(req) || {};
    if (!checkPassword(body.password)) {
      await addHit(key);
      return res.status(401).json({ ok: false, error: 'password' });
    }
    await clearHits(key);
    setSession(res);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Autentificarea a eșuat:', e.message);
    return res.status(500).json({ ok: false, error: 'server' });
  }
};
