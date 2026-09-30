import { describe, it, expect, vi, beforeEach } from 'vitest';

const getNotifyPrefsMock = vi.fn();
const listTasksMock = vi.fn();
const countPendingSyncMock = vi.fn();
const sendEmailMock = vi.fn();
const sendMessageMock = vi.fn();
const getSessionMock = vi.fn();
const isEmailConfiguredMock = vi.fn();

vi.mock('./googleOAuthTokenStore.js', () => ({
  getNotifyPrefs: (...a: unknown[]) => getNotifyPrefsMock(...a),
  prefsFromRow: vi.fn(),
  getValidAccessToken: vi.fn(),
  ensureBackgroundSyncSchema: vi.fn(),
}));
const nextUpMock = vi.fn();
vi.mock('./dailyDigestData.js', () => ({
  listTasksNeedingAttention: (...a: unknown[]) => listTasksMock(...a),
  countPendingSync: (...a: unknown[]) => countPendingSyncMock(...a),
  nextUpcomingTask: (...a: unknown[]) => nextUpMock(...a),
}));
vi.mock('./emailService.js', () => ({
  isEmailConfigured: () => isEmailConfiguredMock(),
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));
vi.mock('./telegramStore.js', () => ({ TelegramSessionStore: { getLinkedSessionForWebUser: (...a: unknown[]) => getSessionMock(...a) } }));
vi.mock('./telegramService.js', () => ({ TelegramService: { sendMessage: (...a: unknown[]) => sendMessageMock(...a) } }));
vi.mock('./agendaFindingsStore.js', () => ({ recordFindings: vi.fn(), markFindingsNotified: vi.fn(), listPendingFindings: vi.fn(async () => []) }));
vi.mock('./db.js', () => ({ query: vi.fn() }));

import { sendTestUpdate } from './sendTestUpdate';

const input = { userId: 'u1', email: 'me@example.com', appUrl: 'https://aheadoftime.app' };
const prefs = (channels: string[]) => ({ prefs: { channels, frequency: 'daily', hour: 7, weekday: 1, timezone: 'UTC' }, saved: true });

describe('sendTestUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ chatId: '555' });
    isEmailConfiguredMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue({ ok: true });
    sendMessageMock.mockResolvedValue({ ok: true });
    listTasksMock.mockResolvedValue({ overdue: [], dueThisWeek: [] });
    countPendingSyncMock.mockResolvedValue(null);
    nextUpMock.mockResolvedValue(null);
  });

  it('emails the signed-in user themselves, marked [Test]; a quiet week says so with the next task, never samples', async () => {
    getNotifyPrefsMock.mockResolvedValue(prefs(['email']));
    nextUpMock.mockResolvedValue({ title: 'Book hotel', eventTitle: 'Trip to Lisbon – 15–21 Oct', dueDate: '2026-10-09' });
    const result = await sendTestUpdate(input);
    expect(result).toMatchObject({ ok: true, usedSample: false, results: [{ channel: 'email', ok: true }] });
    const mail = sendEmailMock.mock.calls[0][0];
    expect(mail.to).toBe('me@example.com');
    expect(mail.subject.startsWith('[Test] ')).toBe(true);
    expect(mail.text).not.toContain('Sample:');
    expect(mail.text).toContain('NOTHING DUE THIS WEEK');
    expect(mail.text).toContain('Next up: Book hotel');
    // Links work: the app address is in the email.
    expect(mail.html).toContain('https://aheadoftime.app/dashboard');
  });

  it('sends the real tasks when there are some', async () => {
    getNotifyPrefsMock.mockResolvedValue(prefs(['email']));
    listTasksMock.mockResolvedValue({
      overdue: [{ title: 'Real task', eventTitle: 'Real event', dueDate: '2026-09-18' }],
      dueThisWeek: [],
    });
    const result = await sendTestUpdate(input);
    expect(result.usedSample).toBe(false);
    expect(sendEmailMock.mock.calls[0][0].text).toContain('Real task');
    expect(sendEmailMock.mock.calls[0][0].text).not.toContain('Sample:');
  });

  it('sends over every chosen channel at once', async () => {
    getNotifyPrefsMock.mockResolvedValue(prefs(['telegram', 'email', 'in_app']));
    const result = await sendTestUpdate(input);
    expect(result.results.map((r) => r.channel)).toEqual(['telegram', 'email']);
    expect(sendMessageMock.mock.calls[0][0]).toBe('555');
    expect(sendMessageMock.mock.calls[0][1]).toContain('Test update');
    expect(sendMessageMock.mock.calls[0][2].parse_mode).toBe('HTML');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the email provider's reason when sending fails, while the other channel still goes out", async () => {
    getNotifyPrefsMock.mockResolvedValue(prefs(['telegram', 'email']));
    sendEmailMock.mockResolvedValue({ ok: false, error: 'Resend: The aheadoftime.app domain is not verified.' });
    const result = await sendTestUpdate(input);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('domain is not verified');
    expect(result.results.find((r) => r.channel === 'telegram')?.ok).toBe(true);
  });

  it('refuses when only the in-app notice is selected (nothing to send)', async () => {
    getNotifyPrefsMock.mockResolvedValue(prefs(['in_app']));
    const result = await sendTestUpdate(input);
    expect(result.ok).toBe(false);
    expect(result.results).toEqual([]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('refuses when email is chosen but not configured here and Telegram is not paired', async () => {
    getNotifyPrefsMock.mockResolvedValue(prefs(['email']));
    isEmailConfiguredMock.mockReturnValue(false);
    expect((await sendTestUpdate(input)).ok).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
