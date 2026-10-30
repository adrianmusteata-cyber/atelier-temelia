/* Cloudflare Turnstile (anti-roboți) pentru formularul public de vizualizare, fără dependențe.
   Variabile: TURNSTILE_SITE_KEY (publică: ajunge în pagină prin /api/contact?action=viz-status),
              TURNSTILE_SECRET_KEY (doar pe server). Tokenul din pagină e de unică folosință. */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const siteKey = () => String(process.env.TURNSTILE_SITE_KEY || '').trim();
const secretKey = () => String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const configured = () => !!(siteKey() && secretKey());

// true doar dacă Cloudflare confirmă tokenul; orice eroare (rețea, timeout, răspuns ciudat) = false
async function verifyTurnstile(token, ip) {
  if (typeof token !== 'string' || !token || token.length > 4096 || !secretKey()) return false;
  const form = new URLSearchParams({ secret: secretKey(), response: token });
  if (ip && ip !== 'necunoscut') form.set('remoteip', ip);
  try {
    const r = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { console.error('Turnstile a răspuns', r.status); return false; }
    const data = await r.json();
    if (!data.success) console.error('Turnstile a refuzat tokenul:', (data['error-codes'] || []).join(', '));
    return data.success === true;
  } catch (e) {
    console.error('Turnstile nu răspunde:', e.message);
    return false;
  }
}

module.exports = { verifyTurnstile, siteKey, configured };
