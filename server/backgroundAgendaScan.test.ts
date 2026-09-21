import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryMock = vi.fn();
const getLinkedSessionMock = vi.fn();
const getValidAccessTokenMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('./googleOAuthTokenStore.js', () => ({
  getValidAccessToken: (...args: unknown[]) => getValidAccessTokenMock(...args),
  ensureBackgroundSyncSchema: () => Promise.resolve(),
}));
vi.mock('./telegramStore.js', () => ({
  TelegramSessionStore: { getLinkedSessionForWebUser: (...args: unknown[]) => getLinkedSessionMock(...args) },
}));
vi.mock('./telegramService.js', () => ({
  TelegramService: { sendMessage: (...args: unknown[]) => sendMessageMock(...args) },
}));

import {
  isPrepWorthy,
  buildDigestMessage,
  runBackgroundAgendaScan,
  type GoogleCalendarItem,
} from './backgroundAgendaScan';

const NOW = new Date('2026-09-21T07:00:00.000Z');

function item(overrides: Partial<GoogleCalendarItem> = {}): GoogleCalendarItem {
  return {
    id: 'g1',
    summary: 'Amsterdam trip',
    status: 'confirmed',
    created: '2026-09-20T18:00:00.000Z',
    start: { date: '2026-10-12' },
    ...overrides,
  };
}

describe('isPrepWorthy', () => {
  it('accepts a normal upcoming event', () => {
    expect(isPrepWorthy(item(), NOW)).toBe(true);
  });

  it('rejects routine work and personal entries', () => {
    expect(isPrepWorthy(item({ summary: 'Weekly team sync' }), NOW)).toBe(false);
    expect(isPrepWorthy(item({ summary: 'Dentist' }), NOW)).toBe(false);
  });

  it('rejects things starting within 2 days', () => {
    expect(isPrepWorthy(item({ start: { date: '2026-09-22' } }), NOW)).toBe(false);
    expect(isPrepWorthy(item({ start: { date: '2026-09-23' } }), NOW)).toBe(true);
  });

  it('rejects cancelled, declined, untitled and non-plan event types', () => {
    expect(isPrepWorthy(item({ status: 'cancelled' }), NOW)).toBe(false);
    expect(isPrepWorthy(item({ attendees: [{ self: true, responseStatus: 'declined' }] }), NOW)).toBe(false);
    expect(isPrepWorthy(item({ summary: '  ' }), NOW)).toBe(false);
    expect(isPrepWorthy(item({ eventType: 'outOfOffice' }), NOW)).toBe(false);
    expect(isPrepWorthy(item({ eventType: 'birthday' }), NOW)).toBe(false);
  });

  it('reads the date from timed events too', () => {
    expect(isPrepWorthy(item({ start: { dateTime: '2026-10-12T19:30:00+02:00' } }), NOW)).toBe(true);
  });
});

describe('buildDigestMessage', () => {
  it('lists events soonest first with the prep-step count', () => {
    const text = buildDigestMessage([
      { title: 'Later thing', eventDate: '2026-12-01', prepSteps: 4 },
      { title: 'Sooner thing', eventDate: '2026-10-02', prepSteps: 9 },
    ]);
    expect(text).toContain('2 new events');
    expect(text.indexOf('Sooner thing')).toBeLessThan(text.indexOf('Later thing'));
    expect(text).toContain('9 prep steps');
  });

  it('uses singular wording and caps the list at 5 with a "more" line', () => {
    expect(buildDigestMessage([{ title: 'Solo', eventDate: '2026-10-02', prepSteps: 0 }])).toContain('a new event');
    const many = Array.from({ length: 7 }, (_, i) => ({ title: `E${i}`, eventDate: `2026-10-0${i + 1}`, prepSteps: 1 }));
    const text = buildDigestMessage(many);
    expect(text).toContain('…and 2 more');
    expect(text).not.toContain('E6');
  });
});

describe('runBackgroundAgendaScan', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM google_oauth_tokens')) {
        return [
          {
            user_id: 'u1',
            email: 'a@example.com',
            linked_at: '2026-09-10T00:00:00.000Z',
            last_agenda_scan_at: '2026-09-20T07:00:00.000Z',
          },
        ];
      }
      return [];
    });
    getLinkedSessionMock.mockResolvedValue({ chatId: '555' });
    getValidAccessTokenMock.mockResolvedValue('tok');
    sendMessageMock.mockResolvedValue({ ok: true });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          item({ id: 'new1' }),
          // created BEFORE the last pass: merely edited, so not "new"
          item({ id: 'old1', summary: 'Old wedding', created: '2026-08-01T00:00:00.000Z' }),
          item({ id: 'routine', summary: 'Daily standup' }),
        ],
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const updateCalls = () => queryMock.mock.calls.filter(([sql]) => String(sql).includes('UPDATE google_oauth_tokens'));

  it('sends one digest with only the new, prep-worthy event and advances the timestamp', async () => {
    const summary = await runBackgroundAgendaScan({ now: NOW, appUrl: 'https://aheadoftime.app' });

    expect(summary).toMatchObject({ usersChecked: 1, usersNotified: 1, eventsReported: 1, failed: 0 });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [chatId, text, options] = sendMessageMock.mock.calls[0];
    expect(chatId).toBe('555');
    expect(text).toContain('Amsterdam trip');
    expect(text).not.toContain('Old wedding');
    expect(text).not.toContain('standup');
    expect(options.reply_markup.inline_keyboard[0][0].url).toBe('https://aheadoftime.app/dashboard?scan=true');
    expect(updateCalls()).toHaveLength(1);
    expect(updateCalls()[0][1]).toEqual(['u1', NOW.toISOString()]);
  });

  it('asks Google only for events updated since the last pass', async () => {
    await runBackgroundAgendaScan({ now: NOW });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('updatedMin=2026-09-20T07%3A00%3A00.000Z');
  });

  it('does not advance the timestamp when Telegram delivery fails, so tomorrow retries', async () => {
    sendMessageMock.mockResolvedValue({ ok: false });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.failed).toBe(1);
    expect(summary.usersNotified).toBe(0);
    expect(updateCalls()).toHaveLength(0);
  });

  it('skips users without Telegram (and leaves their timestamp alone)', async () => {
    getLinkedSessionMock.mockResolvedValue(undefined);
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.skippedNoTelegram).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });

  it('skips users whose Google token is gone/revoked', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.skippedNoToken).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('advances the timestamp without messaging when nothing new needs prep', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.usersNotified).toBe(0);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(1);
  });

  it('counts a Google API failure as failed and does not advance', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.failed).toBe(1);
    expect(updateCalls()).toHaveLength(0);
  });

  it('dry run previews the message but sends nothing and advances nothing', async () => {
    const summary = await runBackgroundAgendaScan({ now: NOW, dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.previews).toHaveLength(1);
    expect(summary.previews![0]).toContain('Amsterdam trip');
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });

  it('omits the button when APP_URL is not https (Telegram rejects such links)', async () => {
    await runBackgroundAgendaScan({ now: NOW, appUrl: 'http://localhost:3000' });
    expect(sendMessageMock.mock.calls[0][2].reply_markup).toBeUndefined();
  });

  it('caps how far back it looks after a long outage', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM google_oauth_tokens')
        ? [{ user_id: 'u1', email: 'a@example.com', linked_at: '2026-01-01T00:00:00.000Z', last_agenda_scan_at: null }]
        : []
    );
    await runBackgroundAgendaScan({ now: NOW });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('updatedMin=2026-09-18T07%3A00%3A00.000Z');
  });
});
