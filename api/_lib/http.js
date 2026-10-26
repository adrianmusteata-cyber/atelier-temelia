/* Ajutoare comune pentru funcțiile din /api */
const crypto = require('crypto');

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'necunoscut';
}

// IP-ul nu se păstrează în clar: doar o amprentă (hash) cu sare secretă
function ipKey(prefix, req) {
  const salt = process.env.ADMIN_SECRET || 'temelia';
  return `${prefix}:${crypto.createHash('sha256').update(salt + clientIp(req)).digest('hex').slice(0, 32)}`;
}

function jsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  return body && typeof body === 'object' ? body : null;
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function allow(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  res.status(405).json({ ok: false, error: 'method' });
  return false;
}

module.exports = { clientIp, ipKey, jsonBody, cookies, allow };
