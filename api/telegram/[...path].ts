import type { Request, Response } from 'express';
import { TelegramWebhookHandler } from '../../server/telegramWebhookHandler.js';
import { TelegramService } from '../../server/telegramService.js';
import { TelegramSessionStore } from '../../server/telegramStore.js';
import { extractBearerToken, verifyGoogleAccessToken } from '../../server/googleAuthVerify.js';

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

    // This reveals whether a real person's Telegram is linked plus their
    // username/chatId, so it must never be answered from an unverified or
    // client-supplied identity - that's exactly how a guest with no Google
    // session at all used to see another (arbitrary "default") account's
    // Telegram connection as if it were their own. Every caller - whether
    // polling by pairing code or asking "is my account linked" - now has to
    // prove who they are first; a request with no verified Google session
    // gets "not linked", full stop, never a fallback identity.
    const verified = await verifyGoogleAccessToken(extractBearerToken(req));
    if (!verified) {
      return res.status(200).json({
        ok: true,
        linked: false,
        status: 'unlinked',
        telegram_linked: false,
        isLinked: false,
        session: null,
        isConfigured,
        hasToken: isConfigured,
        botInfo: botInfo?.ok ? botInfo.result : null,
        webhookInfo: null,
        inferredWebhookUrl,
      });
    }

    const pairStatus = await TelegramSessionStore.getPairingStatus(code, verified.email);

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
      activeSessions: (await TelegramSessionStore.getAllSessions()).length,
      storedEventsCount: (await TelegramSessionStore.getAllEvents()).length,
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
        const record = await TelegramSessionStore.manualLink(code, username, chatId);
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
        // Generating a pairing code ties a Telegram chat to a real web
        // account, so this requires a verified identity rather than
        // trusting a client-claimed email/userId - otherwise anyone could
        // request a code claiming to be someone else's account.
        const verified = await verifyGoogleAccessToken(extractBearerToken(req));
        if (!verified) {
          return res.status(401).json({ ok: false, error: 'Sign in required to generate a pairing code.' });
        }
        const pairingCode = await TelegramSessionStore.createPairingCode(verified.email, verified.email);

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
        // Same identity leak class as /api/telegram/status - never resolve
        // to a client-supplied or default userId.
        const verified = await verifyGoogleAccessToken(extractBearerToken(req));
        if (!verified) {
          return res.status(200).json({ ok: true, linked: false, status: 'unlinked', telegram_linked: false, isLinked: false, session: null });
        }
        const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
        const status = await TelegramSessionStore.getPairingStatus(code, verified.email);
        return res.status(200).json(status);
      } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message || 'Failed to check pairing status' });
      }
    }

    if (req.method === 'DELETE') {
      try {
        // Unlinking by a client-supplied chatId/userId meant anyone could
        // disconnect an arbitrary stranger's Telegram session with no proof
        // of ownership at all. Only ever unlink the verified caller's own
        // linked session.
        const verified = await verifyGoogleAccessToken(extractBearerToken(req));
        if (!verified) {
          return res.status(401).json({ ok: false, error: 'Sign in required to unlink Telegram.' });
        }
        const session = await TelegramSessionStore.getLinkedSessionForWebUser(verified.email);
        if (session) {
          await TelegramSessionStore.unlinkSession(session.chatId);
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
    // This endpoint returns real event data, so identity must be verified
    // rather than trusted from a query param - a client-supplied userId
    // was exactly how the earlier cross-user event exposure bug worked.
    const verified = await verifyGoogleAccessToken(extractBearerToken(req));
    if (!verified) {
      return res.status(200).json({ ok: true, events: [] });
    }

    const ownedEvents = await TelegramSessionStore.getAllEvents(verified.email);

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

  // Note: /api/telegram/event/:id is handled by its own dedicated file
  // (api/telegram/event/[id].ts), not here - a two-segment path under
  // this catch-all was never actually reaching this handler on Vercel
  // (confirmed via logging, in both local vercel dev and production), so
  // it's kept as a separate function instead. There's enough headroom
  // under the Hobby plan's 12-function cap for one extra file here.

  return res.status(404).json({ ok: false, error: 'Not found' });
}
