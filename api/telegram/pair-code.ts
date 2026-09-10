import type { Request, Response } from 'express';
import { TelegramSessionStore } from '../../server/telegramStore.js';
import { TelegramService } from '../../server/telegramService.js';

export default async function handler(req: Request, res: Response) {
  if (req.method === 'POST') {
    try {
      const { userId = 'user_default', email } = req.body || {};
      const pairingCode = TelegramSessionStore.createPairingCode(userId, email);

      let botUsername = 'AheadTimebot';
      try {
        const botMe = await TelegramService.getMe();
        if (botMe.ok && botMe.result?.username) {
          botUsername = botMe.result.username;
        }
      } catch (err) {
        // Fallback to default
      }

      const deepLink = `https://t.me/${botUsername}?start=${pairingCode}`;

      res.status(200).json({
        ok: true,
        pairingCode,
        pairCode: pairingCode,
        botUsername,
        deepLink,
        expiresInSeconds: 86400,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Failed to generate pairing code' });
    }
    return;
  }

  if (req.method === 'GET') {
    try {
      const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
      const userId = (req.query.userId as string) || 'user_default';

      const status = TelegramSessionStore.getPairingStatus(code, userId);
      res.status(200).json(status);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Failed to check pairing status' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const { chatId, userId } = req.body || {};
      if (chatId) {
        TelegramSessionStore.unlinkSession(chatId);
      } else if (userId) {
        const session = TelegramSessionStore.getLinkedSessionForWebUser(userId);
        if (session) {
          TelegramSessionStore.unlinkSession(session.chatId);
        }
      }
      res.status(200).json({ ok: true, message: 'Unlinked successfully' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Failed to unlink session' });
    }
    return;
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
