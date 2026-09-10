import type { Request, Response } from 'express';
import { TelegramWebhookHandler } from '../../server/telegramWebhookHandler.js';
import { TelegramService } from '../../server/telegramService.js';
import { TelegramSessionStore } from '../../server/telegramStore.js';

// Consolidated Vercel catch-all for everything under /api/telegram/*.
// Vercel's Hobby plan caps a deployment at 12 serverless functions; with
// WhatsApp and other routes still to come, having one function per
// telegram endpoint (7 files) was both wasteful and a real production
// outage risk (a deploy silently failed once the cap was hit). Each
// branch below is ported verbatim from the file it replaces - no logic
// changes, just routed by path segment instead of by filesystem path.
export default async function handler(req: any, res: any) {
  // Vercel's catch-all dynamic segment for a file named [...path].ts is
  // delivered under the literal query key "...path" (dots included), not
  // "path" - confirmed by inspecting the actual req.query shape.
  const rawSegments = req.query['...path'];
  const segments: string[] = Array.isArray(rawSegments) ? rawSegments : [rawSegments].filter(Boolean);
  const route = segments[0];

  // --- /api/telegram/webhook ---
  if (route === 'webhook') {
    if (req.method === 'POST') {
      return TelegramWebhookHandler.handleWebhook(req as Request, res as Response);
    }
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        message: 'Ahead Of Time Telegram webhook is active and ready to receive POST updates from Telegram.',
      });
    }
    return res.status(405).json({ error: 'Method not allowed. Telegram Webhook requires POST.' });
  }

  // --- /api/telegram/status ---
  if (route === 'status') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
    const userId = (req.query.userId as string) || 'user_default';

    const isConfigured = TelegramService.isConfigured();
    let botInfo = null;
    let webhookInfo = null;

    if (isConfigured) {
      try {
        botInfo = await TelegramService.getMe();
        webhookInfo = await TelegramService.getWebhookInfo();
      } catch (e: any) {
        console.warn('Could not retrieve telegram status:', e.message);
      }
    }

    const host = req.headers?.['host'] || 'aheadoftime.app';
    const protocol = req.headers?.['x-forwarded-proto'] || 'https';
    const inferredWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;

    const pairStatus = TelegramSessionStore.getPairingStatus(code, userId);

    return res.status(200).json({
      ok: true,
      linked: pairStatus.linked,
      status: pairStatus.status,
      username: pairStatus.username || (pairStatus.session?.username ? `${pairStatus.session.username}` : undefined),
      chatId: pairStatus.chatId || pairStatus.telegram_chat_id,
      telegram_linked: pairStatus.linked,
      isLinked: pairStatus.linked,
      telegram_chat_id: pairStatus.chatId || pairStatus.telegram_chat_id,
      session: pairStatus.session,
      isConfigured,
      hasToken: isConfigured,
      botInfo: botInfo?.ok ? botInfo.result : null,
      webhookInfo: webhookInfo?.ok ? webhookInfo.result : null,
      inferredWebhookUrl,
      activeSessions: TelegramSessionStore.getAllSessions().length,
      storedEventsCount: TelegramSessionStore.getAllEvents().length,
    });
  }

  // --- /api/telegram/manual-link ---
  if (route === 'manual-link') {
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

  // --- /api/telegram/pair-code ---
  if (route === 'pair-code') {
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

        return res.status(200).json({
          ok: true,
          pairingCode,
          pairCode: pairingCode,
          botUsername,
          deepLink,
          expiresInSeconds: 86400,
        });
      } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message || 'Failed to generate pairing code' });
      }
    }

    if (req.method === 'GET') {
      try {
        const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
        const userId = (req.query.userId as string) || 'user_default';
        const status = TelegramSessionStore.getPairingStatus(code, userId);
        return res.status(200).json(status);
      } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message || 'Failed to check pairing status' });
      }
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
        return res.status(200).json({ ok: true, message: 'Unlinked successfully' });
      } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message || 'Failed to unlink session' });
      }
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // --- /api/telegram/set-webhook ---
  if (route === 'set-webhook') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const host = req.headers?.['host'] || 'aheadoftime.app';
      const protocol = req.headers?.['x-forwarded-proto'] || 'https';
      const defaultUrl = `${protocol}://${host}/api/telegram/webhook`;
      const targetUrl = req.body?.webhookUrl || defaultUrl;

      const result = await TelegramService.setWebhook(targetUrl);
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to set webhook' });
    }
  }

  // --- /api/telegram/events (list, or ?id=... for a single event) ---
  if (route === 'events') {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const userId = req.query.userId || req.query.user_id;
    if (!userId) {
      // No caller identity: never return other users' events.
      return res.status(200).json({ ok: true, events: [] });
    }

    const ownedEvents = TelegramSessionStore.getAllEvents(String(userId));

    const eventId = req.query.id || req.query.eventId || req.query.event_id;
    if (eventId) {
      const event = ownedEvents.find((e) => e.id === String(eventId));
      if (event) {
        return res.status(200).json({ ok: true, event });
      }
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    return res.status(200).json({ ok: true, events: ownedEvents });
  }

  // --- /api/telegram/event/:id ---
  if (route === 'event') {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const eventId = segments[1];
    const userId = req.query.userId || req.query.user_id;

    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'Missing event id' });
    }
    if (!userId) {
      // No caller identity: never confirm existence of, or return, another user's event.
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    const event = TelegramSessionStore.getAllEvents(String(userId)).find((e) => e.id === String(eventId));
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }
    return res.status(200).json({ ok: true, event });
  }

  return res.status(404).json({ ok: false, error: 'Not found' });
}
