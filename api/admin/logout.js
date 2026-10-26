/* POST /api/admin/logout — închide sesiunea de administrare */
const { allow } = require('../_lib/http');
const { clearSession } = require('../_lib/auth');

module.exports = function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  clearSession(res);
  res.status(200).json({ ok: true });
};
