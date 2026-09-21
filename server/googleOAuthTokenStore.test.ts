import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./db.js', () => ({ query: vi.fn() }));

import { isBackgroundSyncConfigured } from './googleOAuthTokenStore';
import { getGoogleClientId } from './googleClientId';

// The Google client id is deliberately not required: it is public and falls
// back to the app's own (see googleClientId.ts) - production's runtime did not
// expose VITE_GOOGLE_CLIENT_ID, which hid the feature entirely.
const REQUIRED = ['GOOGLE_OAUTH_CLIENT_SECRET', 'NOTIFY_LINK_SECRET', 'TOKEN_ENCRYPTION_KEY'];

describe('isBackgroundSyncConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not depend on VITE_GOOGLE_CLIENT_ID being visible to the server', () => {
    for (const name of REQUIRED) vi.stubEnv(name, 'x');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '');
    expect(isBackgroundSyncConfigured()).toBe(true);
    expect(getGoogleClientId()).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  it('lets GOOGLE_OAUTH_CLIENT_ID override the client id', () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'override.apps.googleusercontent.com');
    expect(getGoogleClientId()).toBe('override.apps.googleusercontent.com');
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
