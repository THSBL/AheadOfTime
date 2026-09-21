import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./db.js', () => ({ query: vi.fn() }));

import { isBackgroundSyncConfigured } from './googleOAuthTokenStore';

const REQUIRED = ['VITE_GOOGLE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'NOTIFY_LINK_SECRET', 'TOKEN_ENCRYPTION_KEY'];

describe('isBackgroundSyncConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is true only when every required secret is present', () => {
    for (const name of REQUIRED) vi.stubEnv(name, 'x');
    expect(isBackgroundSyncConfigured()).toBe(true);
  });

  it.each(REQUIRED)('is false when %s is missing', (missing) => {
    for (const name of REQUIRED) vi.stubEnv(name, name === missing ? '' : 'x');
    expect(isBackgroundSyncConfigured()).toBe(false);
  });

  it('treats a whitespace-only value as missing', () => {
    for (const name of REQUIRED) vi.stubEnv(name, 'x');
    vi.stubEnv('NOTIFY_LINK_SECRET', '   ');
    expect(isBackgroundSyncConfigured()).toBe(false);
  });
});
