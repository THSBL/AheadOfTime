import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryMock = vi.fn();
const getValidAccessTokenMock = vi.fn();
const getEventMock = vi.fn();

vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('./googleOAuthTokenStore.js', () => ({
  getValidAccessToken: (...args: unknown[]) => getValidAccessTokenMock(...args),
  ensureBackgroundSyncSchema: () => Promise.resolve(),
  hasBackgroundSyncLinked: () => Promise.resolve(true),
}));
vi.mock('./telegramStore.js', () => ({
  TelegramSessionStore: { getEvent: (...args: unknown[]) => getEventMock(...args) },
}));

import { pushEventToGoogleInBackground } from './googleBackgroundPush';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    title: 'Amsterdam trip',
    category: 'travel_trip',
    eventDate: '2027-04-10',
    eventTime: '09:00',
    location: 'Amsterdam',
    milestones: [
      { id: 'm1', title: 'Book train', tMinusLabel: 'T-30d', calculatedDate: '2027-03-10', status: 'pending' },
      { id: 'm2', title: 'Book hotel', tMinusLabel: 'T-21d', calculatedDate: '2027-03-20', status: 'pending' },
    ],
    ...overrides,
  };
}

describe('pushEventToGoogleInBackground', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM events e') ? [{ user_id: 'u1', timezone: null }] : []
    );
    getValidAccessTokenMock.mockResolvedValue('tok');
    getEventMock.mockResolvedValue(makeEvent());
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      n++;
      if (String(url).includes('calendar/v3')) {
        return { ok: true, json: async () => ({ id: 'gcal-1', htmlLink: 'https://cal/link' }) };
      }
      return { ok: true, json: async () => ({ id: `task-${n}` }) };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const writes = (fragment: string) => queryMock.mock.calls.filter(([sql]) => String(sql).includes(fragment));

  it('creates the calendar event and one Google Task per milestone, recording every id', async () => {
    const result = await pushEventToGoogleInBackground('evt-1');

    expect(result).toMatchObject({ status: 'pushed', createdCalendarEvent: true, tasksCreated: 2 });
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.includes('calendar/v3'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('tasks/v1'))).toHaveLength(2);

    const eventWrite = writes('SET google_event_id')[0];
    expect(eventWrite[1]).toEqual(['evt-1', 'gcal-1', 'https://cal/link']);
    expect(writes('SET google_task_id')).toHaveLength(2);
    // Task titles use the shared formatter: task first, event and due date trailing.
    const taskBody = JSON.parse(fetchMock.mock.calls.find(([u]) => String(u).includes('tasks/v1'))![1].body);
    expect(taskBody.title).toBe('Book train · Amsterdam trip · 10/03');
    expect(taskBody.due).toBe('2027-03-10T00:00:00.000Z');
  });

  it('is idempotent: an already-pushed event and already-pushed tasks are left alone', async () => {
    getEventMock.mockResolvedValue(
      makeEvent({
        googleEventId: 'gcal-existing',
        milestones: [
          { id: 'm1', title: 'Book train', tMinusLabel: 'T-30d', calculatedDate: '2027-03-10', status: 'pending', googleTaskId: 't-old' },
          { id: 'm2', title: 'Book hotel', tMinusLabel: 'T-21d', calculatedDate: '2027-03-20', status: 'pending' },
        ],
      })
    );
    const result = await pushEventToGoogleInBackground('evt-1');

    expect(result).toMatchObject({ status: 'pushed', createdCalendarEvent: false, tasksCreated: 1 });
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.includes('calendar/v3'))).toHaveLength(0);
    expect(urls.filter((u) => u.includes('tasks/v1'))).toHaveLength(1);
  });

  it('never pushes a milestone hidden by a preparation-level downgrade (architecture reset Phase 9)', async () => {
    getEventMock.mockResolvedValue(
      makeEvent({
        milestones: [
          { id: 'm1', title: 'Book train', tMinusLabel: 'T-30d', calculatedDate: '2027-03-10', status: 'pending' },
          { id: 'm2', title: 'Book hotel', tMinusLabel: 'T-21d', calculatedDate: '2027-03-20', status: 'pending', isActive: false },
        ],
      })
    );
    const result = await pushEventToGoogleInBackground('evt-1');

    expect(result).toMatchObject({ tasksCreated: 1 });
    const taskUrls = fetchMock.mock.calls.filter(([u]) => String(u).includes('tasks/v1'));
    expect(taskUrls).toHaveLength(1);
    const taskBody = JSON.parse(taskUrls[0][1].body);
    expect(taskBody.title).toContain('Book train');
    expect(writes('SET google_task_id')).toHaveLength(1);
    expect(writes('SET google_task_id')[0][1]).toEqual(['m1', 'task-2']);
  });

  it('skips silently when the owner never linked Background Sync (or it was revoked)', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const result = await pushEventToGoogleInBackground('evt-1');
    expect(result.status).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the event does not exist', async () => {
    queryMock.mockResolvedValue([]);
    expect((await pushEventToGoogleInBackground('nope')).status).toBe('skipped');
  });

  it('reports failure (and creates nothing) when Google rejects everything', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('calendar/v3')
        ? { ok: false, status: 403, json: async () => ({ error: { message: 'insufficient scope' } }) }
        : { ok: false, status: 403, json: async () => ({}) }
    );
    const result = await pushEventToGoogleInBackground('evt-1');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('insufficient scope');
    expect(writes('SET google_task_id')).toHaveLength(0);
  });

  it('still records the tasks that succeeded when the calendar event fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('calendar/v3')
        ? { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) }
        : { ok: true, json: async () => ({ id: 'task-x' }) }
    );
    const result = await pushEventToGoogleInBackground('evt-1');
    expect(result).toMatchObject({ status: 'pushed', createdCalendarEvent: false, tasksCreated: 2 });
  });
});
