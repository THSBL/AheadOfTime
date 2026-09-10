import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncGoogleTasksWithLocalEvents, GoogleTaskItem } from './googleTasks';
import { CalendarEvent, TMinusMilestone } from '../types';

function makeMilestone(overrides: Partial<TMinusMilestone> = {}): TMinusMilestone {
  return {
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-09-24',
    title: 'Book restaurant',
    category: 'booking',
    status: 'pending',
    ...overrides,
  };
}

function makeEvent(milestones: TMinusMilestone[], overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Anniversary Weekend',
    category: 'dinner_social',
    eventDate: '2026-10-01',
    status: 'milestones_active',
    context: {},
    milestones,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetchOnce(items: GoogleTaskItem[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncGoogleTasksWithLocalEvents', () => {
  it('marks a linked milestone completed when the Google Task is completed', async () => {
    mockFetchOnce([
      { id: 'gt-1', title: 'Book restaurant', status: 'completed', completed: '2026-09-20T00:00:00.000Z' },
    ]);
    const event = makeEvent([makeMilestone({ googleTaskId: 'gt-1', status: 'pending' })]);

    const summary = await syncGoogleTasksWithLocalEvents('token', [event]);

    expect(summary.completedCount).toBe(1);
    expect(summary.updatedEvents[0].milestones[0].status).toBe('completed');
  });

  it('reopens a linked milestone when the Google Task is uncompleted', async () => {
    mockFetchOnce([{ id: 'gt-1', title: 'Book restaurant', status: 'needsAction' }]);
    const event = makeEvent([
      makeMilestone({ googleTaskId: 'gt-1', status: 'completed', completedAt: '2026-09-10T00:00:00.000Z' }),
    ]);

    const summary = await syncGoogleTasksWithLocalEvents('token', [event]);

    expect(summary.uncompletedCount).toBe(1);
    expect(summary.updatedEvents[0].milestones[0].status).toBe('pending');
    expect(summary.updatedEvents[0].milestones[0].completedAt).toBeUndefined();
  });

  it('marks a linked milestone skipped (not deleted) when the Google Task was deleted', async () => {
    mockFetchOnce([{ id: 'gt-1', title: 'Book restaurant', status: 'needsAction', deleted: true }]);
    const event = makeEvent([makeMilestone({ googleTaskId: 'gt-1', status: 'pending' })]);

    const summary = await syncGoogleTasksWithLocalEvents('token', [event]);

    expect(summary.skippedCount).toBe(1);
    expect(summary.updatedEvents[0].milestones).toHaveLength(1);
    expect(summary.updatedEvents[0].milestones[0].status).toBe('skipped');
  });

  it('does not re-flip an already-skipped milestone back to pending just because the deleted task still is not completed', async () => {
    mockFetchOnce([{ id: 'gt-1', title: 'Book restaurant', status: 'needsAction', deleted: true }]);
    const event = makeEvent([makeMilestone({ googleTaskId: 'gt-1', status: 'skipped' })]);

    const summary = await syncGoogleTasksWithLocalEvents('token', [event]);

    expect(summary.skippedCount).toBe(0);
    expect(summary.updatedEvents[0].milestones[0].status).toBe('skipped');
  });

  it('links a new milestone to a matching Google Task by title, then recreating under a new id links to the new task', async () => {
    // First sync: task exists under gt-1, milestone has no googleTaskId yet.
    mockFetchOnce([{ id: 'gt-1', title: '[T-7d] Book restaurant (Anniversary Weekend)', status: 'needsAction' }]);
    const event = makeEvent([makeMilestone({ googleTaskId: undefined })]);

    const first = await syncGoogleTasksWithLocalEvents('token', [event]);
    expect(first.linkedTasksCount).toBe(1);
    expect(first.updatedEvents[0].milestones[0].googleTaskId).toBe('gt-1');

    // Simulate the user deleting gt-1 and recreating a fresh task with the
    // same title under a new id (gt-2) - the old id comes back deleted.
    mockFetchOnce([
      { id: 'gt-1', title: '[T-7d] Book restaurant (Anniversary Weekend)', status: 'needsAction', deleted: true },
    ]);
    const second = await syncGoogleTasksWithLocalEvents('token', first.updatedEvents);
    expect(second.skippedCount).toBe(1);
    expect(second.updatedEvents[0].milestones[0].status).toBe('skipped');
  });

  it('does not confuse two different milestones with similar titles across events', async () => {
    mockFetchOnce([
      { id: 'gt-1', title: '[T-7d] Book restaurant (Anniversary Weekend)', status: 'completed', completed: '2026-09-20T00:00:00.000Z' },
      { id: 'gt-2', title: '[T-14d] Book restaurant (New York Trip)', status: 'needsAction' },
    ]);
    const eventA = makeEvent([makeMilestone({ id: 'ms-a', tMinusLabel: 'T-7d' })], {
      id: 'evt-a',
      title: 'Anniversary Weekend',
    });
    const eventB = makeEvent([makeMilestone({ id: 'ms-b', tMinusLabel: 'T-14d' })], {
      id: 'evt-b',
      title: 'New York Trip',
    });

    const summary = await syncGoogleTasksWithLocalEvents('token', [eventA, eventB]);

    const updatedA = summary.updatedEvents.find((e) => e.id === 'evt-a')!;
    const updatedB = summary.updatedEvents.find((e) => e.id === 'evt-b')!;
    expect(updatedA.milestones[0].status).toBe('completed');
    expect(updatedA.milestones[0].googleTaskId).toBe('gt-1');
    expect(updatedB.milestones[0].status).toBe('pending');
    expect(updatedB.milestones[0].googleTaskId).toBe('gt-2');
  });

  it('ignores a deleted task as a candidate for the initial title-based link', async () => {
    mockFetchOnce([{ id: 'gt-1', title: 'Book restaurant', status: 'needsAction', deleted: true }]);
    const event = makeEvent([makeMilestone({ googleTaskId: undefined })]);

    const summary = await syncGoogleTasksWithLocalEvents('token', [event]);

    expect(summary.linkedTasksCount).toBe(0);
    expect(summary.updatedEvents[0].milestones[0].googleTaskId).toBeUndefined();
    expect(summary.updatedEvents[0].milestones[0].status).toBe('pending');
  });

  it('requests deleted tasks and pages through multiple result pages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'gt-1', title: 'Book restaurant', status: 'completed', completed: 'x' }], nextPageToken: 'p2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'gt-2', title: 'Other task', status: 'needsAction' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const event = makeEvent([makeMilestone({ googleTaskId: 'gt-1', status: 'pending' })]);
    const summary = await syncGoogleTasksWithLocalEvents('token', [event]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('showDeleted=true');
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=p2');
    expect(summary.completedCount).toBe(1);
  });
});
