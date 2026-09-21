import { describe, it, expect } from 'vitest';
import { hashEvent, mergeServerChanges, findDirtyEvents, stampUpdatedAt } from './eventSyncMerge';
import type { CalendarEvent } from '../types';

function ev(id: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    category: 'dinner_social',
    eventDate: '2026-10-12',
    status: 'milestones_active',
    context: {},
    milestones: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('hashEvent', () => {
  it('ignores updatedAt and key order, but notices real changes', () => {
    const a = ev('a');
    const reordered = { updatedAt: 'x', milestones: [], context: {}, status: a.status, eventDate: a.eventDate, category: a.category, title: a.title, id: 'a', createdAt: a.createdAt } as CalendarEvent;
    expect(hashEvent(a)).toBe(hashEvent(reordered));
    expect(hashEvent(a)).not.toBe(hashEvent(ev('a', { title: 'Renamed' })));
    expect(hashEvent(a)).not.toBe(
      hashEvent(ev('a', { milestones: [{ id: 'm', eventId: 'a', tMinusLabel: 'T-1d', tMinusOffsetMinutes: -1440, calculatedDate: '2026-10-11', title: 't', category: 'booking', status: 'pending' }] }))
    );
  });
});

describe('mergeServerChanges', () => {
  it('adds events that only exist on the server (the mobile-shows-nothing case)', () => {
    const { events, adopted } = mergeServerChanges([], [ev('desktop-1'), ev('desktop-2')], []);
    expect(events.map((e) => e.id)).toEqual(['desktop-1', 'desktop-2']);
    expect(adopted).toEqual(['desktop-1', 'desktop-2']);
  });

  it('keeps local-only events (they will be pushed)', () => {
    const { events } = mergeServerChanges([ev('mine')], [ev('theirs')], []);
    expect(events.map((e) => e.id).sort()).toEqual(['mine', 'theirs']);
  });

  it('newest updatedAt wins on both sides; ties keep the local copy', () => {
    const local = ev('a', { title: 'local edit', updatedAt: '2026-09-10T12:00:00.000Z' });
    const olderServer = ev('a', { title: 'server old', updatedAt: '2026-09-10T11:00:00.000Z' });
    expect(mergeServerChanges([local], [olderServer], []).events[0].title).toBe('local edit');

    const newerServer = ev('a', { title: 'server new', updatedAt: '2026-09-10T13:00:00.000Z' });
    const merged = mergeServerChanges([local], [newerServer], []);
    expect(merged.events[0].title).toBe('server new');
    expect(merged.adopted).toEqual(['a']);

    const tie = ev('a', { title: 'tie', updatedAt: local.updatedAt });
    expect(mergeServerChanges([local], [tie], []).events[0].title).toBe('local edit');
  });

  it('keeps the local createdAt when adopting a newer server copy', () => {
    const local = ev('a', { createdAt: '2026-01-01T00:00:00.000Z' });
    const server = ev('a', { createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z' });
    expect(mergeServerChanges([local], [server], []).events[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('drops events another device deleted, and never re-adds them', () => {
    const { events, removed } = mergeServerChanges([ev('gone'), ev('stays')], [ev('gone')], ['gone']);
    expect(events.map((e) => e.id)).toEqual(['stays']);
    expect(removed).toEqual(['gone']);
  });

  it('does not resurrect an event this session just deleted while a poll was in flight', () => {
    const { events } = mergeServerChanges([], [ev('just-deleted')], [], new Set(['just-deleted']));
    expect(events).toEqual([]);
  });

  it('adopts the server copy with its milestones wholesale (a Telegram refine added one)', () => {
    const local = ev('a', { updatedAt: '2026-09-10T10:00:00.000Z' });
    const server = ev('a', {
      updatedAt: '2026-09-10T11:00:00.000Z',
      milestones: [{ id: 'm1', eventId: 'a', tMinusLabel: 'T-3d', tMinusOffsetMinutes: -4320, calculatedDate: '2026-10-09', title: 'Added in Telegram', category: 'booking', status: 'pending' }],
    });
    expect(mergeServerChanges([local], [server], []).events[0].milestones).toHaveLength(1);
  });
});

describe('findDirtyEvents / stampUpdatedAt', () => {
  it('flags never-synced and edited events, not unchanged ones', () => {
    const a = ev('a');
    const b = ev('b');
    const hashes = { a: hashEvent(a), b: hashEvent(b) };
    expect(findDirtyEvents([a, b], hashes)).toEqual([]);
    expect(findDirtyEvents([a, ev('b', { title: 'edited' })], hashes).map((e) => e.id)).toEqual(['b']);
    expect(findDirtyEvents([a, ev('new')], hashes).map((e) => e.id)).toEqual(['new']);
  });

  it('does not treat a timestamp-only change as dirty, so stamping never loops', () => {
    const a = ev('a');
    const hashes = { a: hashEvent(a) };
    const stamped = stampUpdatedAt([a], new Set(['a']), '2026-09-21T00:00:00.000Z');
    expect(stamped[0].updatedAt).toBe('2026-09-21T00:00:00.000Z');
    expect(findDirtyEvents(stamped, hashes)).toEqual([]);
  });
});
