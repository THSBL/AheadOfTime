import type { CalendarEvent } from '../types.js';

/**
 * Pure helpers for the multi-device event sync (see services/eventSync.ts and
 * server/eventSyncStore.ts). Conflicts resolve last-write-wins PER EVENT by
 * `updatedAt`; whether a local event still needs pushing is decided by a
 * content hash, not by timestamps, so an edit that forgot to bump `updatedAt`
 * still syncs.
 */

/** JSON with sorted keys, so equal content always serialises identically. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Content fingerprint of an event - everything except its own `updatedAt`. */
export function hashEvent(event: CalendarEvent): string {
  const { updatedAt: _ignored, ...rest } = event;
  const text = stableStringify(rest);
  // Small non-cryptographic hash (FNV-1a): only used to detect "changed since
  // last sync", never for security.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

const time = (iso?: string): number => {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? 0 : ms;
};

export interface MergeResult {
  events: CalendarEvent[];
  /** Ids whose content was taken from the server (nothing to push for them). */
  adopted: string[];
  /** Ids removed because another device deleted them. */
  removed: string[];
}

/**
 * Folds the server's changes into this device's list.
 *  - deleted elsewhere -> dropped here too
 *  - only on the server -> added
 *  - on both -> the newer `updatedAt` wins wholesale (ties keep the local copy)
 *  - only local -> kept (it gets pushed)
 * `locallyDeleted` are ids this session deleted itself and must not come back
 * from a poll that was already in flight.
 */
export function mergeServerChanges(
  local: CalendarEvent[],
  serverEvents: CalendarEvent[],
  deletedIds: string[],
  locallyDeleted: ReadonlySet<string> = new Set()
): MergeResult {
  const deleted = new Set(deletedIds);
  const removed = local.filter((e) => deleted.has(e.id)).map((e) => e.id);
  const events = local.filter((e) => !deleted.has(e.id));
  const indexById = new Map(events.map((e, i) => [e.id, i]));
  const adopted: string[] = [];

  for (const s of serverEvents) {
    if (deleted.has(s.id) || locallyDeleted.has(s.id)) continue;
    const idx = indexById.get(s.id);
    if (idx === undefined) {
      indexById.set(s.id, events.length);
      events.push(s);
      adopted.push(s.id);
      continue;
    }
    const l = events[idx];
    if (time(s.updatedAt) > time(l.updatedAt)) {
      events[idx] = { ...s, createdAt: l.createdAt || s.createdAt };
      adopted.push(s.id);
    }
  }
  return { events, adopted, removed };
}

/** Local events whose content differs from what was last synced. */
export function findDirtyEvents(events: CalendarEvent[], syncedHashes: Record<string, string>): CalendarEvent[] {
  return events.filter((e) => syncedHashes[e.id] !== hashEvent(e));
}

/** Stamps the edit time on events about to be pushed (last-write-wins needs it). */
export function stampUpdatedAt(events: CalendarEvent[], ids: ReadonlySet<string>, nowIso: string): CalendarEvent[] {
  return events.map((e) => (ids.has(e.id) ? { ...e, updatedAt: nowIso } : e));
}
