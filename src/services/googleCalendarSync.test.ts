import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncEventToGoogleCalendar } from './googleCalendar';
import { planSyncStatus, describePlanSync, stepFingerprint } from '../utils/googleSyncPlan';
import type { CalendarEvent, TMinusMilestone } from '../types';

/**
 * Syncing a plan that's already in Google: changed steps are updated in
 * place, steps no longer in the plan come out, and a plan pushed before it
 * kept a record of its Google copies gets its old copies replaced - never
 * duplicates next to them. Google is faked by recording every request.
 */

type Call = { method: string; url: string; body: any };

function fakeGoogle(opts: { tasks?: Array<{ id: string; title: string }>; calendarItems?: Array<{ id: string; summary: string }> } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, body });
    if (method === 'GET' && url.includes('tasks.googleapis.com')) return ok({ items: opts.tasks || [] });
    if (method === 'GET' && url.includes('/calendars/primary/events')) return ok({ items: opts.calendarItems || [] });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (method === 'POST') return ok({ id: `new-${++n}`, htmlLink: 'https://calendar.google.com/x' });
    return ok({ id: url.split('/').pop() });
  });
  return calls;
}

const step = (id: string, title: string, date: string, extra: Partial<TMinusMilestone> = {}): TMinusMilestone =>
  ({ id, eventId: 'trip', title, calculatedDate: `${date}T09:00:00`, status: 'pending', category: 'logistics', tMinusLabel: 'T-1d', tMinusOffsetMinutes: -1440, ...extra }) as TMinusMilestone;

const trip = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    id: 'trip',
    title: 'Namibie – Trip with family',
    category: 'travel_trip',
    eventDate: '2027-03-25',
    eventTime: '19:00',
    status: 'milestones_active',
    context: {},
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    milestones: [],
    ...extra,
  }) as CalendarEvent;

const tasksCalls = (calls: Call[], method: string) => calls.filter((c) => c.method === method && c.url.includes('tasks.googleapis.com'));
const calendarCalls = (calls: Call[], method: string) => calls.filter((c) => c.method === method && c.url.includes('/calendars/primary/events'));

describe('syncing a plan that is already in Google', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-01T10:00:00Z'), toFake: ['Date'] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('first push: the event and every step, and the plan remembers what went in', async () => {
    const calls = fakeGoogle();
    const event = trip({ milestones: [step('a', 'Book flights', '2026-12-01'), step('b', 'Pack', '2027-03-23')] });
    const result = await syncEventToGoogleCalendar('tok', event);
    expect(tasksCalls(calls, 'POST')).toHaveLength(2);
    expect(calendarCalls(calls, 'POST')).toHaveLength(1);
    const updated = result.updatedEvent!;
    expect(Object.keys(updated.googleSynced!)).toEqual(['a', 'b']);
    expect(updated.googleSynced!.a.hash).toBe(stepFingerprint(event.milestones[0], event.title));
    expect(planSyncStatus(updated)).toMatchObject({ toAdd: 0, toUpdate: 0, toRemove: 0, eventChanged: false });
  });

  it('a renamed or moved step is updated in place; an unchanged one is left alone', async () => {
    fakeGoogle();
    const first = (await syncEventToGoogleCalendar('tok', trip({ milestones: [step('a', 'Book flights', '2026-12-01'), step('b', 'Pack', '2027-03-23')] }))).updatedEvent!;
    const changed = { ...first, milestones: first.milestones.map((m) => (m.id === 'a' ? { ...m, title: 'Book flights to Windhoek', calculatedDate: '2026-12-05T09:00:00' } : m)) };
    expect(describePlanSync(planSyncStatus(changed))).toBe('1 changed');

    const calls = fakeGoogle();
    const result = await syncEventToGoogleCalendar('tok', changed);
    const patches = tasksCalls(calls, 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain(first.googleSynced!.a.task!);
    expect(patches[0].body.title).toBe('Book flights to Windhoek · Namibie – Trip with family · 05/12');
    expect(patches[0].body.due).toBe('2026-12-05T00:00:00.000Z');
    expect(tasksCalls(calls, 'POST')).toHaveLength(0);
    expect(result.updatedItemsCount).toBe(1);
    expect(isUpToDate(result.updatedEvent!)).toBe(true);
  });

  it('a correction that replaces the steps: old Google copies come out, the new steps go in - no duplicates', async () => {
    fakeGoogle();
    const first = (await syncEventToGoogleCalendar('tok', trip({ milestones: [step('a', 'Book flights', '2026-12-01'), step('b', 'Pack', '2027-03-23')] }))).updatedEvent!;
    const corrected = { ...first, milestones: [step('x', 'Book flights and a 4x4', '2026-12-01'), step('y', 'Pack', '2027-03-23')] };
    expect(planSyncStatus(corrected)).toMatchObject({ toAdd: 2, toRemove: 2 });

    const calls = fakeGoogle();
    const result = await syncEventToGoogleCalendar('tok', corrected);
    expect(tasksCalls(calls, 'DELETE').map((c) => c.url.split('/').pop())).toEqual([first.googleSynced!.a.task, first.googleSynced!.b.task]);
    expect(tasksCalls(calls, 'POST')).toHaveLength(2);
    expect(result.removedItemsCount).toBe(2);
    expect(Object.keys(result.updatedEvent!.googleSynced!)).toEqual(['x', 'y']);
  });

  it('a plan pushed before it kept a record: its old copies are found by title and replaced, once', async () => {
    const legacy = trip({
      googleEventId: 'g-main',
      syncedToGoogleAt: '2026-10-20T10:00:00Z',
      googleMilestoneCount: 2,
      milestones: [step('new1', 'Book flights and a 4x4', '2026-12-01'), step('new2', 'Pack', '2027-03-23')],
    });
    const status = planSyncStatus(legacy);
    expect(status).toMatchObject({ legacyCleanup: true, toAdd: 2, eventMissing: false });
    expect(describePlanSync(status)).toBe('2 new · old copies replaced');

    const calls = fakeGoogle({
      tasks: [
        { id: 'old-t1', title: 'Book flights · Namibie – Trip with family · 01/12' },
        { id: 'old-t2', title: '✅ Renew passports · Namibie – Trip with family · 10/11' },
        { id: 'mine', title: 'Buy milk' },
      ],
    });
    const result = await syncEventToGoogleCalendar('tok', legacy);
    expect(tasksCalls(calls, 'DELETE').map((c) => c.url.split('/').pop())).toEqual(['old-t1', 'old-t2']);
    expect(tasksCalls(calls, 'POST')).toHaveLength(2);
    // The event itself is the same one, updated - not a second event.
    expect(calendarCalls(calls, 'POST')).toHaveLength(0);
    expect(calendarCalls(calls, 'PATCH')[0].url).toContain('g-main');
    expect(planSyncStatus(result.updatedEvent!).legacyCleanup).toBe(false);
  });

  it('switching tasks to timed reminders replaces each task with an event at the chosen hour', async () => {
    fakeGoogle();
    const first = (await syncEventToGoogleCalendar('tok', trip({ milestones: [step('a', 'Book flights', '2026-12-01')] }))).updatedEvent!;
    const calls = fakeGoogle();
    const result = await syncEventToGoogleCalendar('tok', first, 'Europe/Brussels', { milestoneFormat: 'timed', reminderTime: '20:00', reminderMinutes: 15 });
    expect(tasksCalls(calls, 'DELETE')).toHaveLength(1);
    const created = calendarCalls(calls, 'POST');
    expect(created).toHaveLength(1);
    expect(created[0].body.start.dateTime).toContain('2026-12-01T20:00');
    expect(result.updatedEvent!.googleSynced!.a).toMatchObject({ task: undefined, event: expect.any(String) });
  });

  it('an event imported from the calendar is never rewritten', async () => {
    const calls = fakeGoogle();
    await syncEventToGoogleCalendar('tok', trip({ googleEventId: 'theirs', milestones: [step('a', 'Book flights', '2026-12-01')] }));
    expect(calendarCalls(calls, 'PATCH')).toHaveLength(0);
    expect(tasksCalls(calls, 'DELETE')).toHaveLength(0);
  });
});

function isUpToDate(event: CalendarEvent) {
  const s = planSyncStatus(event);
  return s.toAdd + s.toUpdate + s.toRemove === 0 && !s.eventChanged;
}
