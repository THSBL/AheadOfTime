import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getValidAccessTokenMock = vi.fn();
const hasTasksScopeMock = vi.fn();
vi.mock('./googleOAuthTokenStore.js', () => ({
  getValidAccessToken: (...args: unknown[]) => getValidAccessTokenMock(...args),
  backgroundSyncHasTasksScope: (...args: unknown[]) => hasTasksScopeMock(...args),
}));

import { handleCalendarPush, handleCalendarEvents } from './googleCalendarServerApi';

const event = {
  id: 'evt_1',
  title: 'Dive trip',
  category: 'travel_trip',
  eventDate: '2026-12-14',
  eventTime: '09:00',
  milestones: [{ id: 'ms_1', title: 'Book dive center', tMinusLabel: 'T-30d', calculatedDate: '2026-11-14', status: 'pending' }],
};

describe('server Push to Cal / Scan agenda', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getValidAccessTokenMock.mockResolvedValue('server-token');
    hasTasksScopeMock.mockResolvedValue(true);
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/calendars/primary')) return { ok: true, json: async () => ({ id: 'me@example.com', summary: 'Me', timeZone: 'Europe/Amsterdam' }) };
      if (u.includes('/calendars/primary/events?')) return { ok: true, json: async () => ({ items: [{ id: 'g1', summary: 'Wedding' }] }) };
      if (u.includes('calendar/v3')) return { ok: true, json: async () => ({ id: 'gcal-1', htmlLink: 'https://cal/link' }) };
      return { ok: true, json: async () => ({ id: 'task-1', items: [] }) };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes with the stored grant and returns the sync result', async () => {
    const r = await handleCalendarPush('u1', 'POST', { event, timeZone: 'Europe/Amsterdam', milestoneFormat: 'tasks_only' });
    expect(r.status).toBe(200);
    expect(getValidAccessTokenMock).toHaveBeenCalledWith('u1');
    expect((r.body.result as any).mainEventId).toBe('gcal-1');
    const auth = fetchMock.mock.calls.map(([, init]) => init?.headers?.Authorization).filter(Boolean);
    expect(auth.every((h) => h === 'Bearer server-token')).toBe(true);
  });

  it('answers 409 (fall back to the browser) when Background Sync is not linked', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const r = await handleCalendarPush('u1', 'POST', { event });
    expect(r.status).toBe(409);
    expect(r.body.linked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed event and a bad scan window', async () => {
    expect((await handleCalendarPush('u1', 'POST', { event: { id: 1 } })).status).toBe(400);
    expect((await handleCalendarEvents('u1', 'GET', { timeMin: 'x', timeMax: 'y' })).status).toBe(400);
    expect((await handleCalendarEvents('u1', 'GET', { timeMin: '2026-01-01', timeMax: '2028-01-01' })).status).toBe(400);
  });

  it('scans the agenda with the stored grant, returning profile and items', async () => {
    const r = await handleCalendarEvents('u1', 'GET', { timeMin: '2026-09-25T00:00:00Z', timeMax: '2027-03-25T00:00:00Z', maxResults: '9999' });
    expect(r.status).toBe(200);
    expect((r.body.profile as any).id).toBe('me@example.com');
    expect(r.body.items).toHaveLength(1);
    const listUrl = String(fetchMock.mock.calls.find(([u]) => String(u).includes('events?'))![0]);
    expect(listUrl).toContain('maxResults=250');
  });

  it('falls back to the browser (409) when the grant lacks Google Tasks', async () => {
    hasTasksScopeMock.mockResolvedValue(false);
    const r = await handleCalendarPush('u1', 'POST', { event });
    expect(r.status).toBe(409);
    expect(r.body.tasksGranted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
