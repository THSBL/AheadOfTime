import { TelegramSessionStore } from '../_lib/telegramStore.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { code, username = 'Telegram User', chatId = 123456789 } = req.body || {};
      const record = TelegramSessionStore.manualLink(code, username, chatId);
      return res.status(200).json({
        ok: true,
        linked: true,
        status: 'linked',
        username: record.username,
        chatId: record.chatId,
        record,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message || 'Failed to manually link' });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
