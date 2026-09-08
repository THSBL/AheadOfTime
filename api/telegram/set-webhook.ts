import { TelegramService } from '../../server/telegramService';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const host = req.headers['host'] || 'aheadoftime.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const defaultUrl = `${protocol}://${host}/api/telegram/webhook`;
    const targetUrl = req.body?.webhookUrl || defaultUrl;

    const result = await TelegramService.setWebhook(targetUrl);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to set webhook' });
  }
}
