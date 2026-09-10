import { TelegramSessionStore } from '../../../server/telegramStore.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const eventId = req.query.id;
  const userId = req.query.userId || req.query.user_id;

  if (!eventId) {
    return res.status(400).json({ ok: false, error: 'Missing event id' });
  }
  if (!userId) {
    // No caller identity: never confirm existence of, or return, another user's event.
    return res.status(404).json({ ok: false, error: 'Event not found' });
  }

  // Scope the lookup through the same ownership-filtered query used by
  // /api/telegram/events, so a guessed/known event id can't be used to
  // read another user's event.
  const event = TelegramSessionStore.getAllEvents(String(userId)).find((e) => e.id === String(eventId));

  if (!event) {
    return res.status(404).json({ ok: false, error: 'Event not found' });
  }

  return res.status(200).json({ ok: true, event });
}
