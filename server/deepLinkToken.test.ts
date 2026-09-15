import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signEventDeepLink, verifyEventDeepLink } from './deepLinkToken';

describe('deepLinkToken', () => {
  const ORIGINAL_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-value';
  });

  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = ORIGINAL_SECRET;
    vi.useRealTimers();
  });

  it('signs a token that verifies successfully for the same event id', () => {
    const signed = signEventDeepLink('event-123');
    expect(signed).not.toBeNull();
    expect(verifyEventDeepLink('event-123', signed!.token, String(signed!.expiresAt))).toBe(true);
  });

  it('rejects a token when checked against a different event id', () => {
    const signed = signEventDeepLink('event-123');
    expect(verifyEventDeepLink('event-999', signed!.token, String(signed!.expiresAt))).toBe(false);
  });

  it('rejects a tampered expiry timestamp', () => {
    const signed = signEventDeepLink('event-123');
    const tamperedExpiry = String(signed!.expiresAt + 1000 * 60 * 60);
    expect(verifyEventDeepLink('event-123', signed!.token, tamperedExpiry)).toBe(false);
  });

  it('rejects a tampered token value', () => {
    const signed = signEventDeepLink('event-123');
    expect(verifyEventDeepLink('event-123', signed!.token.slice(0, -2) + 'ff', String(signed!.expiresAt))).toBe(false);
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const signed = signEventDeepLink('event-123');
    // 15 minutes + 1 second later
    vi.setSystemTime(new Date('2026-01-01T00:15:01Z'));
    expect(verifyEventDeepLink('event-123', signed!.token, String(signed!.expiresAt))).toBe(false);
  });

  it('accepts a token right up to its expiry boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const signed = signEventDeepLink('event-123');
    vi.setSystemTime(new Date(signed!.expiresAt));
    expect(verifyEventDeepLink('event-123', signed!.token, String(signed!.expiresAt))).toBe(true);
  });

  it('returns null from signing and false from verifying when the secret is not configured', () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(signEventDeepLink('event-123')).toBeNull();

    // A token signed while the secret WAS configured must also fail
    // verification once the secret is removed - a missing secret should
    // never fail open.
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-value';
    const signed = signEventDeepLink('event-123');
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(verifyEventDeepLink('event-123', signed!.token, String(signed!.expiresAt))).toBe(false);
  });

  it('rejects missing token or expiry inputs', () => {
    expect(verifyEventDeepLink('event-123', undefined, '123')).toBe(false);
    expect(verifyEventDeepLink('event-123', 'abc', undefined)).toBe(false);
    expect(verifyEventDeepLink('', 'abc', '123')).toBe(false);
  });

  it('rejects a non-numeric expiry value', () => {
    const signed = signEventDeepLink('event-123');
    expect(verifyEventDeepLink('event-123', signed!.token, 'not-a-number')).toBe(false);
  });
});
