/* GET /api/admin/telegram-chats — chaturile (grupurile) în care a fost adăugat botul,
   ca să aflăm ID-ul pentru TELEGRAM_PAYMENTS_CHAT_ID. Doar pentru administrator. */
const { allow } = require('../_lib/http');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'Lipsește TELEGRAM_BOT_TOKEN' });
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(10000) });
    const data = await r.json();
    if (!data.ok) return res.status(502).json({ ok: false, error: data.description || 'telegram' });
    const chats = new Map();
    for (const u of data.result) {
      const c = (u.my_chat_member || u.message || u.channel_post || u.edited_message || {}).chat;
      if (c) chats.set(c.id, { id: c.id, title: c.title || [c.first_name, c.last_name].filter(Boolean).join(' '), type: c.type });
    }
    return res.status(200).json({
      ok: true,
      payments_chat_configured: !!process.env.TELEGRAM_PAYMENTS_CHAT_ID,
      chats: [...chats.values()],
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
};
