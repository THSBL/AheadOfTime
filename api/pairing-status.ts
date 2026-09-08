import type { Request, Response } from 'express';
import { TelegramSessionStore } from './_lib/telegramStore.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    try {
      const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
      const userId = (req.query.userId as string) || 'user_default';

      const status = TelegramSessionStore.getPairingStatus(code, userId);
      return res.status(200).json(status);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message || 'Failed to get pairing status' });
    }
  }

  res.setHeader('Allow', ['GET']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
