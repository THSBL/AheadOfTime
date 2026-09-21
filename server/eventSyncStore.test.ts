import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('./eventSyncSchema.js', () => ({ ensureEventSyncSchema: () => Promise.resolve(), PURGE_AFTER_DAYS: 30 }));
vi.mock('./telegramStore.js', () => ({
  findOrCreateUserByEmail: () => Promise.resolve('user-1'),
  rowToCalendarEvent: (row: any) => ({ id: row.client_id || row.id, title: row.title }),
}));

import {
  sanitizeIncomingEvent,
  applyIncomingEvents,
  listEventChanges,
  restoreDeletedEvent,
  purgeDeletedEvents,
} from './eventSyncStore';

const NOW = Date.parse('2026-09-21T12:00:00.000Z');

function rawEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_123',
    title: 'Maya birthday party',
    category: 'dinner_social',
    eventDate: '2026-10-02',
    status: 'milestones_active',
    context: { guestCount: 12 },
    updatedAt: '2026-09-21T11:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    milestones: [
      { id: 'ms_1', title: 'Send invites', calculatedDate: '2026-09-20', status: 'pending', category: 'booking' },
      { id: 'ms_2', title: 'Order cake', calculatedDate: '2026-09-28', status: 'completed', completedAt: '2026-09-21T09:00:00.000Z' },
    ],
    ...overrides,
  };
}

describe('sanitizeIncomingEvent', () => {
  it('keeps a well-formed event and its milestones', () => {
    const e = sanitizeIncomingEvent(rawEvent(), NOW)!;
    expect(e.publicId).toBe('evt_123');
    expect(e.eventDate).toBe('2026-10-02');
    expect(e.milestones.map((m) => m.publicId)).toEqual(['ms_1', 'ms_2']);
    expect(e.milestones[1].status).toBe('completed');
    expect(e.updatedAtMs).toBe(Date.parse('2026-09-21T11:00:00.000Z'));
  });

  it('rejects events without an id or a valid date', () => {
    expect(sanitizeIncomingEvent(rawEvent({ id: '' }), NOW)).toBeNull();
    expect(sanitizeIncomingEvent(rawEvent({ eventDate: 'tomorrow' }), NOW)).toBeNull();
    expect(sanitizeIncomingEvent(null, NOW)).toBeNull();
  });

  it('clamps a far-future updatedAt so a wrong clock cannot make an event unbeatable', () => {
    const e = sanitizeIncomingEvent(rawEvent({ updatedAt: '2099-01-01T00:00:00.000Z' }), NOW)!;
    expect(e.updatedAtMs).toBe(NOW + 5 * 60 * 1000);
  });

  it('caps field lengths and falls back to safe defaults', () => {
    const e = sanitizeIncomingEvent(rawEvent({ title: 'x'.repeat(1000), status: 42, milestones: [{ id: 'm', title: '', status: 'weird' }] }), NOW)!;
    expect(e.title).toHaveLength(300);
    expect(e.status).toBe('milestones_active');
    expect(e.milestones[0]).toMatchObject({ title: 'Untitled task', status: 'pending', calculatedDate: '2026-10-02' });
  });
});

describe('applyIncomingEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sqlCalls = (fragment: string) => queryMock.mock.calls.filter(([sql]) => String(sql).includes(fragment));

  it('inserts a new event starting at the epoch, writes milestones, then stamps the real edit time last', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM events WHERE user_id')) return []; // unknown to the server
      if (sql.includes('INSERT INTO events')) return [{ id: 'uuid-1' }];
      if (sql.includes('FROM milestones WHERE event_id')) return [];
      return [];
    });

    const summary = await applyIncomingEvents('a@example.com', [rawEvent()]);

    expect(summary).toEqual({ applied: 1, skipped: 0, failed: 0 });
    const insert = sqlCalls('INSERT INTO events')[0];
    expect(insert[1]).toContain('1970-01-01T00:00:00.000Z'); // retry-safe until the final UPDATE
    expect(insert[1]).toContain('evt_123'); // client_id
    expect(sqlCalls('INSERT INTO milestones')).toHaveLength(2);
    const order = queryMock.mock.calls.map(([sql]) => String(sql));
    const lastUpdate = order.map((s, i) => (s.includes('UPDATE events') && s.includes('client_updated_at') ? i : -1)).filter((i) => i >= 0).pop()!;
    const lastMilestoneInsert = order.map((s, i) => (s.includes('INSERT INTO milestones') ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(lastUpdate).toBeGreaterThan(lastMilestoneInsert);
  });

  it('skips a push that is not newer than what the server has (last write wins)', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM events WHERE user_id')
        ? [{ id: 'uuid-1', deleted_at: null, ver: '2026-09-21T11:30:00.000Z' }]
        : []
    );
    const summary = await applyIncomingEvents('a@example.com', [rawEvent()]);
    expect(summary).toEqual({ applied: 0, skipped: 1, failed: 0 });
    expect(sqlCalls('INSERT')).toHaveLength(0);
    expect(sqlCalls('UPDATE events')).toHaveLength(0);
  });

  it('applies a newer edit: updates changed milestones, adds new ones and removes the ones the edit dropped', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM events WHERE user_id'))
        return [{ id: 'uuid-1', deleted_at: null, ver: '2026-09-21T10:00:00.000Z' }];
      if (sql.includes('FROM milestones WHERE event_id'))
        return [
          { id: 'mu-1', client_id: 'ms_1' },
          { id: 'mu-gone', client_id: 'ms_removed' },
        ];
      return [];
    });
    const summary = await applyIncomingEvents('a@example.com', [rawEvent()]);
    expect(summary.applied).toBe(1);
    expect(sqlCalls('UPDATE milestones')).toHaveLength(1); // ms_1 exists
    expect(sqlCalls('INSERT INTO milestones')).toHaveLength(1); // ms_2 is new
    const del = sqlCalls('DELETE FROM milestones')[0];
    expect(del[1]).toEqual([['mu-gone']]);
  });

  it('never revives an event deleted elsewhere: the tombstone wins', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM events WHERE user_id')
        ? [{ id: 'uuid-1', deleted_at: '2026-09-20T00:00:00.000Z', ver: '2026-09-01T00:00:00.000Z' }]
        : []
    );
    const summary = await applyIncomingEvents('a@example.com', [rawEvent()]);
    expect(summary).toEqual({ applied: 0, skipped: 1, failed: 0 });
    expect(sqlCalls('UPDATE events')).toHaveLength(0);
  });

  it('counts a database error on one event as failed without aborting the rest', async () => {
    let n = 0;
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM events WHERE user_id')) {
        n++;
        if (n === 1) throw new Error('db hiccup');
        return [];
      }
      if (sql.includes('INSERT INTO events')) return [{ id: 'uuid-2' }];
      return [];
    });
    const summary = await applyIncomingEvents('a@example.com', [rawEvent({ id: 'a' }), rawEvent({ id: 'b' })]);
    expect(summary).toEqual({ applied: 1, skipped: 0, failed: 1 });
  });

  it('processes at most 100 events per push', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM events WHERE user_id') ? [{ id: 'u', deleted_at: '2026-01-01', ver: 'x' }] : []
    );
    const many = Array.from({ length: 150 }, (_, i) => rawEvent({ id: `e${i}` }));
    const summary = await applyIncomingEvents('a@example.com', many);
    expect(summary.skipped).toBe(100);
  });
});

describe('listEventChanges / restore / purge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns changed events (public ids) and the ids deleted since the cursor', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT now()')) return [{ now: '2026-09-21T12:00:00.000Z' }];
      if (sql.includes('FROM users')) return [{ id: 'user-1' }];
      if (sql.includes('FROM events') && sql.includes('deleted_at IS NULL')) return [{ id: 'uuid-1', client_id: 'evt_9', title: 'Trip' }];
      if (sql.includes('FROM milestones')) return [];
      if (sql.includes('deleted_at IS NOT NULL')) return [{ id: 'uuid-2', client_id: null }, { id: 'uuid-3', client_id: 'evt_old' }];
      return [];
    });
    const changes = await listEventChanges('a@example.com', '2026-09-21T11:00:00.000Z');
    expect(changes.events.map((e) => e.id)).toEqual(['evt_9']);
    expect(changes.deletedIds).toEqual(['uuid-2', 'evt_old']);
    expect(changes.serverTime).toBe('2026-09-21T12:00:00.000Z');
    const eventsCall = queryMock.mock.calls.find(([sql]) => String(sql).includes('deleted_at IS NULL'))!;
    expect(eventsCall[1][1]).toBe('2026-09-21T11:00:00.000Z');
  });

  it('returns nothing for an unknown user', async () => {
    queryMock.mockImplementation(async (sql: string) => (sql.includes('SELECT now()') ? [{ now: '2026-09-21T12:00:00.000Z' }] : []));
    expect(await listEventChanges('nobody@example.com')).toMatchObject({ events: [], deletedIds: [] });
  });

  it('restores only a deleted event of that user', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users')) return [{ id: 'user-1' }];
      if (sql.includes('SET deleted_at = NULL')) return [{ id: 'uuid-1' }];
      return [];
    });
    expect(await restoreDeletedEvent('a@example.com', 'evt_9')).toBe(true);
    const call = queryMock.mock.calls.find(([sql]) => String(sql).includes('SET deleted_at = NULL'))!;
    expect(call[1]).toEqual(['user-1', 'evt_9']);
  });

  it('purges only events deleted longer ago than the retention window', async () => {
    queryMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    expect(await purgeDeletedEvents()).toBe(2);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toContain('deleted_at < now() - make_interval');
    expect(params).toEqual([30]);
  });
});
