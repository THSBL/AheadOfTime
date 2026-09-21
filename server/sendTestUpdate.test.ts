import { describe, it, expect, vi, beforeEach } from 'vitest';

const getNotifyChannelMock = vi.fn();
const listTasksMock = vi.fn();
const sendEmailMock = vi.fn();
const sendMessageMock = vi.fn();
const getSessionMock = vi.fn();
const isEmailConfiguredMock = vi.fn();

vi.mock('./googleOAuthTokenStore.js', () => ({
  getNotifyChannel: (...a: unknown[]) => getNotifyChannelMock(...a),
  NOTIFY_CHANNELS: ['telegram', 'email', 'in_app'],
  getValidAccessToken: vi.fn(),
  ensureBackgroundSyncSchema: vi.fn(),
}));
vi.mock('./dailyDigestData.js', () => ({ listTasksNeedingAttention: (...a: unknown[]) => listTasksMock(...a) }));
vi.mock('./emailService.js', () => ({
  isEmailConfigured: () => isEmailConfiguredMock(),
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));
vi.mock('./telegramStore.js', () => ({ TelegramSessionStore: { getLinkedSessionForWebUser: (...a: unknown[]) => getSessionMock(...a) } }));
vi.mock('./telegramService.js', () => ({ TelegramService: { sendMessage: (...a: unknown[]) => sendMessageMock(...a) } }));
vi.mock('./agendaFindingsStore.js', () => ({ recordFindings: vi.fn(), markFindingsNotified: vi.fn() }));
vi.mock('./db.js', () => ({ query: vi.fn() }));

import { sendTestUpdate } from './sendTestUpdate';

const input = { userId: 'u1', email: 'me@example.com', appUrl: 'https://aheadoftime.app' };

describe('sendTestUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ chatId: '555' });
    isEmailConfiguredMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue({ ok: true });
    sendMessageMock.mockResolvedValue({ ok: true });
    listTasksMock.mockResolvedValue({ overdue: [], dueThisWeek: [] });
  });

  it('emails the signed-in user themselves, marked [Test], with sample content when nothing is real yet', async () => {
    getNotifyChannelMock.mockResolvedValue('email');
    const result = await sendTestUpdate(input);
    expect(result).toMatchObject({ ok: true, channel: 'email', usedSample: true });
    const mail = sendEmailMock.mock.calls[0][0];
    expect(mail.to).toBe('me@example.com');
    expect(mail.subject.startsWith('[Test] ')).toBe(true);
    expect(mail.text).toContain('Sample:');
  });

  it('sends the real tasks when there are some', async () => {
    getNotifyChannelMock.mockResolvedValue('email');
    listTasksMock.mockResolvedValue({
      overdue: [{ title: 'Real task', eventTitle: 'Real event', dueDate: '2026-09-18' }],
      dueThisWeek: [],
    });
    const result = await sendTestUpdate(input);
    expect(result.usedSample).toBe(false);
    expect(sendEmailMock.mock.calls[0][0].text).toContain('Real task');
    expect(sendEmailMock.mock.calls[0][0].text).not.toContain('Sample:');
  });

  it("surfaces the email provider's reason when sending fails", async () => {
    getNotifyChannelMock.mockResolvedValue('email');
    sendEmailMock.mockResolvedValue({ ok: false, error: 'Resend: The aheadoftime.app domain is not verified.' });
    const result = await sendTestUpdate(input);
    expect(result).toMatchObject({ ok: false, error: 'Resend: The aheadoftime.app domain is not verified.' });
  });

  it('sends over Telegram with a test label when that is the channel', async () => {
    getNotifyChannelMock.mockResolvedValue('telegram');
    const result = await sendTestUpdate(input);
    expect(result).toMatchObject({ ok: true, channel: 'telegram' });
    expect(sendMessageMock.mock.calls[0][0]).toBe('555');
    expect(sendMessageMock.mock.calls[0][1]).toContain('Test update');
    expect(sendMessageMock.mock.calls[0][2].parse_mode).toBe('HTML');
  });

  it('refuses when the effective channel is the in-app notice (nothing to send)', async () => {
    getNotifyChannelMock.mockResolvedValue('in_app');
    const result = await sendTestUpdate(input);
    expect(result.ok).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('falls back to in-app (and refuses) when email is chosen but not configured here', async () => {
    getNotifyChannelMock.mockResolvedValue('email');
    isEmailConfiguredMock.mockReturnValue(false);
    expect((await sendTestUpdate(input)).channel).toBe('in_app');
  });
});
