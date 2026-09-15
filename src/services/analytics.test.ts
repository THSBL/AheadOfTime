import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasAnalyticsConsent } from './analytics';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, value),
  });
}

describe('hasAnalyticsConsent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed when no consent decision has been recorded yet', () => {
    // Regression test: GA previously fired unconditionally regardless of
    // the cookie banner's choice - no decision recorded must mean no
    // tracking, not "assume yes."
    stubLocalStorage();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('returns false when the user explicitly declined analytics', () => {
    stubLocalStorage({
      has_cookie_consent_v1: JSON.stringify({ hasConsented: true, functional: true, analytics: false }),
    });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('returns true when the user explicitly opted into analytics', () => {
    stubLocalStorage({
      has_cookie_consent_v1: JSON.stringify({ hasConsented: true, functional: true, analytics: true }),
    });
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('fails closed on malformed stored consent rather than throwing', () => {
    stubLocalStorage({ has_cookie_consent_v1: 'not-json' });
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
