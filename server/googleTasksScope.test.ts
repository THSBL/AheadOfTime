import { describe, it, expect } from 'vitest';
import { grantIncludesTasks } from './googleOAuthTokenStore';

describe('grantIncludesTasks', () => {
  it('reads the scope string Google returned', () => {
    expect(grantIncludesTasks('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks')).toBe(true);
    expect(grantIncludesTasks('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly')).toBe(false);
    expect(grantIncludesTasks('https://www.googleapis.com/auth/tasks.readonly')).toBe(false);
    expect(grantIncludesTasks('https://www.googleapis.com/auth/calendar.events tasks-refused')).toBe(false);
  });
  it('treats an unknown scope (older rows) as granted', () => {
    expect(grantIncludesTasks(null)).toBe(true);
    expect(grantIncludesTasks('')).toBe(true);
  });
});
