import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEventDeepLink } from './telegramService';

describe('buildEventDeepLink', () => {
  const ORIGINAL_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-value';
  });

  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it('builds a signed link to the event with the requested action', () => {
    const url = buildEventDeepLink('event-123', 'https://app.example.com', 'push');

    expect(url).toContain('https://app.example.com/?event_id=event-123');
    expect(url).toContain('action=push');
    expect(url).toMatch(/&dlt=[0-9a-f]+&dlte=\d+/);
  });

  it('defaults the action to refine', () => {
    const url = buildEventDeepLink('event-123', 'https://app.example.com');
    expect(url).toContain('action=refine');
  });

  it('strips trailing slashes from the app base URL', () => {
    const url = buildEventDeepLink('event-123', 'https://app.example.com///', 'push');
    expect(url.startsWith('https://app.example.com/?event_id=event-123')).toBe(true);
  });

  it('url-encodes the event id', () => {
    const url = buildEventDeepLink('event/with slash', 'https://app.example.com', 'push');
    expect(url).toContain(`event_id=${encodeURIComponent('event/with slash')}`);
  });

  it('omits the signed token query params when no signing secret is configured', () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const url = buildEventDeepLink('event-123', 'https://app.example.com', 'push');
    expect(url).toBe('https://app.example.com/?event_id=event-123&action=push');
  });
});
