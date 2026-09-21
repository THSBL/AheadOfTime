import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryMock = vi.fn();
const getLinkedSessionMock = vi.fn();
const getValidAccessTokenMock = vi.fn();
const sendMessageMock = vi.fn();
const sendEmailMock = vi.fn();
const isEmailConfiguredMock = vi.fn();
const recordFindingsMock = vi.fn();
const markFindingsNotifiedMock = vi.fn();

vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('./googleOAuthTokenStore.js', () => ({
  getValidAccessToken: (...args: unknown[]) => getValidAccessTokenMock(...args),
  ensureBackgroundSyncSchema: () => Promise.resolve(),
  NOTIFY_CHANNELS: ['telegram', 'email', 'in_app'],
}));
vi.mock('./telegramStore.js', () => ({
  TelegramSessionStore: { getLinkedSessionForWebUser: (...args: unknown[]) => getLinkedSessionMock(...args) },
}));
vi.mock('./telegramService.js', () => ({
  TelegramService: { sendMessage: (...args: unknown[]) => sendMessageMock(...args) },
}));
vi.mock('./emailService.js', () => ({
  isEmailConfigured: () => isEmailConfiguredMock(),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));
vi.mock('./agendaFindingsStore.js', () => ({
  recordFindings: (...args: unknown[]) => recordFindingsMock(...args),
  markFindingsNotified: (...args: unknown[]) => markFindingsNotifiedMock(...args),
}));

import {
  isPrepWorthy,
  buildDigestMessage,
  buildDigestEmail,
  toCandidate,
  runBackgroundAgendaScan,
  type GoogleCalendarItem,
  type ScanCandidate,
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

function candidate(overrides: Partial<ScanCandidate> = {}): ScanCandidate {
  return { googleEventId: 'g1', title: 'Event', eventDate: '2026-10-02', prepSteps: 0, steps: [], ...overrides };
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
      candidate({ title: 'Later thing', eventDate: '2026-12-01', prepSteps: 4 }),
      candidate({ title: 'Sooner thing', eventDate: '2026-10-02', prepSteps: 9 }),
    ]);
    expect(text).toContain('2 new events');
    expect(text.indexOf('Sooner thing')).toBeLessThan(text.indexOf('Later thing'));
    expect(text).toContain('9 prep steps');
  });

  it('uses singular wording and caps the list at 5 with a "more" line', () => {
    expect(buildDigestMessage([candidate({ title: 'Solo' })])).toContain('a new event');
    const many = Array.from({ length: 7 }, (_, i) => candidate({ title: `E${i}`, eventDate: `2026-10-0${i + 1}` }));
    const text = buildDigestMessage(many);
    expect(text).toContain('…and 2 more');
    expect(text).not.toContain('E6');
  });
});

describe('toCandidate', () => {
  it('carries the Google id and a dated prep plan', () => {
    const c = toCandidate(item({ id: 'abc', summary: 'Weekend trip to Paris', location: 'Paris' }));
    expect(c.googleEventId).toBe('abc');
    expect(c.steps.length).toBeGreaterThan(0);
    expect(c.prepSteps).toBe(c.steps.length);
    expect([...c.steps].sort((a, b) => a.date.localeCompare(b.date))).toEqual(c.steps);
  });
});

describe('buildDigestEmail', () => {
  const steps = Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${20 + (i % 9)}`, title: `Step ${i}` }));

  it('has a subject, the prep plan per event, a review link, and escapes event titles', () => {
    const { subject, html, text } = buildDigestEmail(
      [candidate({ title: '<b>Party</b> & more', steps, prepSteps: 10 }), candidate({ title: 'Trip', eventDate: '2026-11-01' })],
      'https://aheadoftime.app'
    );
    expect(subject).toBe('2 new events on your calendar - your prep plans');
    expect(text).toContain('Step 0');
    expect(text).toContain('…and 2 more steps'); // capped at 8 per event
    expect(text).toContain('https://aheadoftime.app/dashboard?scan=true');
    expect(html).toContain('&lt;b&gt;Party&lt;/b&gt; &amp; more');
    expect(html).not.toContain('<b>Party</b>');
    expect(html).toContain('href="https://aheadoftime.app/dashboard?scan=true"');
  });

  it('names the single event in the subject and omits the link without an https app url', () => {
    const { subject, html } = buildDigestEmail([candidate({ title: 'Solo trip' })], 'http://localhost:3000');
    expect(subject).toBe('New on your calendar: Solo trip - your prep plan');
    expect(html).not.toContain('Review &amp; add');
  });
});

describe('runBackgroundAgendaScan', () => {
  const fetchMock = vi.fn();
  let userRow: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    userRow = {
      user_id: 'u1',
      email: 'a@example.com',
      linked_at: '2026-09-10T00:00:00.000Z',
      last_agenda_scan_at: '2026-09-20T07:00:00.000Z',
      notify_channel: null,
    };
    queryMock.mockImplementation(async (sql: string) => (sql.includes('FROM google_oauth_tokens') ? [userRow] : []));
    getLinkedSessionMock.mockResolvedValue({ chatId: '555' });
    getValidAccessTokenMock.mockResolvedValue('tok');
    sendMessageMock.mockResolvedValue({ ok: true });
    sendEmailMock.mockResolvedValue({ ok: true });
    isEmailConfiguredMock.mockReturnValue(true);
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

  it('defaults to Telegram: one digest with only the new, prep-worthy event, then advances the timestamp', async () => {
    const summary = await runBackgroundAgendaScan({ now: NOW, appUrl: 'https://aheadoftime.app' });

    expect(summary).toMatchObject({ usersChecked: 1, usersNotified: 1, usersInAppOnly: 0, eventsReported: 1, failed: 0 });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [chatId, text, options] = sendMessageMock.mock.calls[0];
    expect(chatId).toBe('555');
    expect(text).toContain('Amsterdam trip');
    expect(text).not.toContain('Old wedding');
    expect(text).not.toContain('standup');
    expect(options.reply_markup.inline_keyboard[0][0].url).toBe('https://aheadoftime.app/dashboard?scan=true');
    expect(recordFindingsMock).toHaveBeenCalledTimes(1);
    expect(markFindingsNotifiedMock).toHaveBeenCalledWith('u1', ['new1'], 'telegram');
    expect(updateCalls()).toHaveLength(1);
    expect(updateCalls()[0][1]).toEqual(['u1', NOW.toISOString()]);
  });

  it('asks Google only for events updated since the last pass', async () => {
    await runBackgroundAgendaScan({ now: NOW });
    expect(String(fetchMock.mock.calls[0][0])).toContain('updatedMin=2026-09-20T07%3A00%3A00.000Z');
  });

  it('does not advance the timestamp when Telegram delivery fails, so tomorrow retries', async () => {
    sendMessageMock.mockResolvedValue({ ok: false });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.failed).toBe(1);
    expect(summary.usersNotified).toBe(0);
    expect(markFindingsNotifiedMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });

  it('falls back to the in-app notice for users without Telegram: recorded, not marked delivered', async () => {
    getLinkedSessionMock.mockResolvedValue(undefined);
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary).toMatchObject({ usersNotified: 0, usersInAppOnly: 1, eventsReported: 1, failed: 0 });
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(recordFindingsMock).toHaveBeenCalledTimes(1);
    expect(markFindingsNotifiedMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(1);
  });

  it('sends the daily email with the prep plan when the user chose email', async () => {
    userRow.notify_channel = 'email';
    const summary = await runBackgroundAgendaScan({ now: NOW, appUrl: 'https://aheadoftime.app' });
    expect(summary).toMatchObject({ usersNotified: 1, usersInAppOnly: 0, failed: 0 });
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0][0];
    expect(mail.to).toBe('a@example.com');
    expect(mail.subject).toContain('Amsterdam trip');
    expect(mail.text).toContain('Amsterdam trip');
    expect(markFindingsNotifiedMock).toHaveBeenCalledWith('u1', ['new1'], 'email');
  });

  it('retries tomorrow when the email fails to send', async () => {
    userRow.notify_channel = 'email';
    sendEmailMock.mockResolvedValue({ ok: false });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.failed).toBe(1);
    expect(markFindingsNotifiedMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });

  it('falls back to the in-app notice when email is chosen but not configured on this deployment', async () => {
    userRow.notify_channel = 'email';
    isEmailConfiguredMock.mockReturnValue(false);
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.usersInAppOnly).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('honours an explicit in-app choice even when Telegram is paired', async () => {
    userRow.notify_channel = 'in_app';
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.usersInAppOnly).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('skips users whose Google token is gone/revoked', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.skippedNoToken).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(recordFindingsMock).not.toHaveBeenCalled();
  });

  it('advances the timestamp without messaging when nothing new needs prep', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.usersNotified).toBe(0);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(recordFindingsMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(1);
  });

  it('counts a Google API failure as failed and does not advance', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const summary = await runBackgroundAgendaScan({ now: NOW });
    expect(summary.failed).toBe(1);
    expect(updateCalls()).toHaveLength(0);
  });

  it('dry run previews the message but sends, records and advances nothing', async () => {
    const summary = await runBackgroundAgendaScan({ now: NOW, dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.previews).toHaveLength(1);
    expect(summary.previews![0]).toContain('Amsterdam trip');
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(recordFindingsMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });

  it('omits the Telegram button when APP_URL is not https (Telegram rejects such links)', async () => {
    await runBackgroundAgendaScan({ now: NOW, appUrl: 'http://localhost:3000' });
    expect(sendMessageMock.mock.calls[0][2].reply_markup).toBeUndefined();
  });

  it('caps how far back it looks after a long outage', async () => {
    userRow.last_agenda_scan_at = null;
    userRow.linked_at = '2026-01-01T00:00:00.000Z';
    await runBackgroundAgendaScan({ now: NOW });
    expect(String(fetchMock.mock.calls[0][0])).toContain('updatedMin=2026-09-18T07%3A00%3A00.000Z');
  });
});
