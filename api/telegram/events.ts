import type { Request, Response } from 'express';
import { TelegramSessionStore } from '../_lib/telegramStore.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const eventId = req.query.id || req.query.eventId || req.query.event_id;
    if (eventId) {
      const event = TelegramSessionStore.getEvent(String(eventId));
      if (event) {
        return res.status(200).json({ ok: true, event });
      }
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }
    return res.status(200).json({ ok: true, events: TelegramSessionStore.getAllEvents() });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
