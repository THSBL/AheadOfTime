import type { Request, Response } from 'express';
import { TelegramSessionStore } from '../../server/telegramStore.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const userId = req.query.userId || req.query.user_id;
    if (!userId) {
      // No caller identity: never return other users' events.
      return res.status(200).json({ ok: true, events: [] });
    }

    // Scope every lookup (single event or full list) through the same
    // ownership-filtered query, so a guessed/known event id can't be used
    // to read another user's event.
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
  return res.status(405).json({ error: 'Method not allowed' });
}
