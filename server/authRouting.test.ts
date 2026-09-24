import { describe, it, expect } from 'vitest';
import { resolveAuthRoute } from './authRouting';

describe('resolveAuthRoute (api/auth/[...path].ts)', () => {
  it('maps every existing Google URL to the same action as before', () => {
    expect(resolveAuthRoute({ '...path': ['google', 'authorize'] })).toEqual({ provider: 'google', action: 'authorize' });
    expect(resolveAuthRoute({ '...path': ['google', 'status'] })).toEqual({ provider: 'google', action: 'status' });
    expect(resolveAuthRoute({ '...path': ['google', 'findings'] })).toEqual({ provider: 'google', action: 'findings' });
    expect(resolveAuthRoute({ '...path': ['google', 'callback'], code: 'abc', state: 'xyz' })).toEqual({ provider: 'google', action: 'callback' });
  });

  it('keeps the old default: /api/auth/google alone meant status', () => {
    expect(resolveAuthRoute({ '...path': 'google' })).toEqual({ provider: 'google', action: 'status' });
  });

  it('rejects unknown providers, actions and deeper paths', () => {
    expect(resolveAuthRoute({ '...path': ['microsoft', 'authorize'] })).toBeNull();
    expect(resolveAuthRoute({ '...path': ['google', 'delete-everything'] })).toBeNull();
    expect(resolveAuthRoute({ '...path': ['google', 'status', 'extra'] })).toBeNull();
    expect(resolveAuthRoute({})).toBeNull();
  });
});
