import type { CalendarEvent } from '../types';

/**
 * Client side of the multi-device event sync (server: server/eventsApi.ts).
 * All calls need a live Google access token - the server identifies the user
 * from it - and every failure is swallowed into `null`/`false`: sync is
 * best-effort, the local list always keeps working.
 */

export interface SyncState {
  /** id -> content hash at the last successful sync (what "unchanged" means). */
  hashes: Record<string, string>;
  /** Server clock of the last pull; the next pull only asks for changes after it. */
  since?: string;
}

export interface ChangesResponse {
  events: CalendarEvent[];
  deletedIds: string[];
  serverTime: string;
}

export interface DeletedEventSummary {
  id: string;
  title: string;
  eventDate: string;
  deletedAt: string;
  milestoneTitles: string[];
}

const stateKey = (userId: string) => `aot_event_sync_v1_${userId}`;

export function loadSyncState(userId: string): SyncState {
  try {
    const raw = localStorage.getItem(stateKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.hashes === 'object') {
        return { hashes: parsed.hashes, since: typeof parsed.since === 'string' ? parsed.since : undefined };
      }
    }
  } catch {
    // Unreadable state just means a full re-sync.
  }
  return { hashes: {} };
}

export function saveSyncState(userId: string, state: SyncState): void {
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    // Quota/private mode: the next run simply re-derives it.
  }
}

// With no live Google token, the app session cookie authenticates the call.
const authHeaders = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

function isChanges(data: any): data is ChangesResponse {
  return Boolean(data?.ok) && Array.isArray(data.events) && typeof data.serverTime === 'string';
}

export async function pullEventChanges(token: string | null, since?: string): Promise<ChangesResponse | null> {
  try {
    const url = `/api/telegram/events${since ? `?since=${encodeURIComponent(since)}` : ''}`;
    const res = await fetch(url, { headers: authHeaders(token), cache: 'no-store' });
    const data = await res.json();
    return isChanges(data) ? { events: data.events, deletedIds: data.deletedIds || [], serverTime: data.serverTime } : null;
  } catch {
    return null;
  }
}

export async function pushEventChanges(
  token: string | null,
  events: CalendarEvent[],
  since?: string
): Promise<ChangesResponse | null> {
  try {
    const res = await fetch('/api/telegram/events', {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, since }),
      cache: 'no-store',
    });
    const data = await res.json();
    return isChanges(data) ? { events: data.events, deletedIds: data.deletedIds || [], serverTime: data.serverTime } : null;
  } catch {
    return null;
  }
}

export async function fetchDeletedEvents(token: string | null): Promise<DeletedEventSummary[] | null> {
  try {
    const res = await fetch('/api/telegram/events?deleted=1', { headers: authHeaders(token), cache: 'no-store' });
    const data = await res.json();
    return data?.ok && Array.isArray(data.deleted) ? data.deleted : null;
  } catch {
    return null;
  }
}

export async function restoreDeletedEvent(token: string | null, id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/telegram/events', {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ restoreId: id }),
      cache: 'no-store',
    });
    const data = await res.json();
    return Boolean(data?.ok && data.restored);
  } catch {
    return false;
  }
}
