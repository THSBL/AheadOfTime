import type { Request, Response } from 'express';
import { TelegramWebhookHandler } from '../../server/telegramWebhookHandler';

export default async function handler(req: any, res: any) {
  // Support POST for Telegram webhook
  if (req.method === 'POST') {
    return TelegramWebhookHandler.handleWebhook(req as Request, res as Response);
  }

  // Support GET for health checks / browser inspection
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'Ahead Of Time Telegram webhook is active and ready to receive POST updates from Telegram.',
    });
  }

  // Return 405 for other unsupported methods
  return res.status(405).json({ error: 'Method not allowed. Telegram Webhook requires POST.' });
}
