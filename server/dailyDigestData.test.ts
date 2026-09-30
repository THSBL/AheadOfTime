import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('./eventSyncSchema.js', () => ({ ensureEventSyncSchema: vi.fn() }));

import { countPendingSync, listTasksNeedingAttention } from './dailyDigestData';

describe('countPendingSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts plans and tasks not in the calendar yet for people who sync to Google', async () => {
    queryMock.mockResolvedValueOnce([{ syncs: true, feed: false }]).mockResolvedValueOnce([{ tasks: '3' }, { tasks: '4' }]);
    expect(await countPendingSync('u1', '2026-09-30T08:00:00Z')).toEqual({ plans: 2, tasks: 7 });
    const [sql] = queryMock.mock.calls[1];
    expect(sql).toContain('m.google_task_id IS NULL');
    expect(sql).toContain('COALESCE(e.end_date, e.event_date) >= $2::date');
  });

  it('says nothing to people who never synced, or who use the calendar feed', async () => {
    queryMock.mockResolvedValueOnce([{ syncs: false, feed: false }]);
    expect(await countPendingSync('u1', '2026-09-30T08:00:00Z')).toBeNull();
    queryMock.mockResolvedValueOnce([{ syncs: true, feed: true }]);
    expect(await countPendingSync('u1', '2026-09-30T08:00:00Z')).toBeNull();
  });
});

describe('listTasksNeedingAttention', () => {
  beforeEach(() => vi.clearAllMocks());

  it('splits late and due-this-week, and leaves out tasks hidden by the help level', async () => {
    queryMock.mockResolvedValue([
      { title: 'Book flights', event_title: 'Trip', due: '2026-09-28' },
      { title: 'Pack', event_title: 'Trip', due: '2026-10-02' },
    ]);
    const result = await listTasksNeedingAttention('u1', '2026-09-30T08:00:00Z');
    expect(result.overdue.map((t) => t.title)).toEqual(['Book flights']);
    expect(result.dueThisWeek.map((t) => t.title)).toEqual(['Pack']);
    expect(queryMock.mock.calls[0][0]).toContain('COALESCE(m.is_active, true)');
  });
});
