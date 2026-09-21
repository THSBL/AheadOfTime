import { TelegramSessionStore } from './telegramStore.js';
import {
  applyIncomingEvents,
  listEventChanges,
  listDeletedEvents,
  restoreDeletedEvent,
} from './eventSyncStore.js';

/**
 * One implementation of /api/telegram/events for both runtimes (the Vercel
 * catch-all in api/telegram/[...path].ts and Express in server.ts), so the two
 * can't drift apart. `email` is the VERIFIED Google identity, or null when the
 * caller presented none.
 *
 *   GET  ?since=<serverTime>   events changed since (all when omitted) + ids deleted since
 *   GET  ?deleted=1            what Settings can restore
 *   GET  ?id=<eventId>         one event
 *   POST { events, since }     push changed events, get everyone's changes back
 *   POST { restoreId }         undo a delete
 */
export async function handleEventsApi(input: {
  method: string;
  query: Record<string, any>;
  body: any;
  email: string | null;
}): Promise<{ status: number; json: any }> {
  const { method, query: q, body, email } = input;

  if (method === 'GET') {
    // Real event data: identity is verified, never trusted from a query param
    // (a client-supplied userId was how an earlier cross-user leak worked).
    if (!email) return { status: 200, json: { ok: true, events: [], deletedIds: [] } };

    if (q.deleted === '1' || q.deleted === 'true') {
      return { status: 200, json: { ok: true, deleted: await listDeletedEvents(email) } };
    }

    const eventId = q.id || q.eventId || q.event_id;
    if (eventId) {
      const owned = await TelegramSessionStore.getAllEvents(email);
      const event = owned.find((e) => e.id === String(eventId));
      return event
        ? { status: 200, json: { ok: true, event } }
        : { status: 404, json: { ok: false, error: 'Event not found' } };
    }

    const changes = await listEventChanges(email, typeof q.since === 'string' ? q.since : undefined);
    return { status: 200, json: { ok: true, ...changes } };
  }

  if (method === 'POST') {
    if (!email) return { status: 401, json: { ok: false, error: 'Unauthorized' } };

    if (body?.restoreId) {
      const restored = await restoreDeletedEvent(email, String(body.restoreId));
      return { status: 200, json: { ok: true, restored } };
    }

    const summary = await applyIncomingEvents(email, Array.isArray(body?.events) ? body.events : []);
    const changes = await listEventChanges(email, typeof body?.since === 'string' ? body.since : undefined);
    return { status: 200, json: { ok: true, summary, ...changes } };
  }

  return { status: 405, json: { error: 'Method not allowed' } };
}
