import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { signOAuthState, verifyOAuthState } from './notifyActionToken';

describe('OAuth state round trip', () => {
  beforeEach(() => {
    vi.stubEnv('NOTIFY_LINK_SECRET', 'test-secret-value');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    'aheadoftime.support@gmail.com', // dots in the local part AND the domain
    'first.middle.last@sub.example.co.uk',
    'plain@x.io',
  ])('verifies a state minted for %s and returns the same address', (email) => {
    const { state } = signOAuthState(email)!;
    expect(verifyOAuthState(state)).toEqual({ email });
  });

  it('normalises the address to lower case', () => {
    const { state } = signOAuthState('Mixed.Case@Gmail.com')!;
    expect(verifyOAuthState(state)?.email).toBe('mixed.case@gmail.com');
  });

  it('rejects a tampered state, a different secret, garbage and an expired state', () => {
    const { state } = signOAuthState('a.b@c.com')!;
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const forged = Buffer.from(decoded.replace('a.b@c.com', 'evil.admin@c.com')).toString('base64url');
    expect(verifyOAuthState(forged)).toBeNull();
    expect(verifyOAuthState('not-a-state')).toBeNull();
    expect(verifyOAuthState(undefined)).toBeNull();

    vi.stubEnv('NOTIFY_LINK_SECRET', 'another-secret');
    expect(verifyOAuthState(state)).toBeNull();

    vi.stubEnv('NOTIFY_LINK_SECRET', 'test-secret-value');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(verifyOAuthState(state)).toBeNull();
  });
});
