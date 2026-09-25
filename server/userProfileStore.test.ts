import { describe, it, expect, vi, beforeEach } from 'vitest';

const db: { rows: Map<string, any>; statements: string[] } = { rows: new Map(), statements: [] };
vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    db.statements.push(sql);
    if (sql.startsWith('SELECT profile')) {
      const row = db.rows.get(params[0]);
      return row ? [{ profile: row }] : [];
    }
    if (sql.startsWith('INSERT INTO user_profiles')) db.rows.set(params[0], JSON.parse(params[7]));
    return [];
  }),
}));

import { handleProfileApi } from './userProfileStore';
import { sanitizeOnboardingProfile } from '../src/utils/profileSanitize';

describe('onboarding profile on the server', () => {
  beforeEach(() => { db.rows.clear(); db.statements = []; });

  it('requires a signed-in user', async () => {
    expect((await handleProfileApi({ method: 'GET', body: null, userId: null })).status).toBe(401);
  });

  it('stores a profile and returns it on the next GET (what Settings loads)', async () => {
    const profile = { family_structure: 'couple', hasPet: true, homeZipOrLocation: ' Ghent ', primaryCalendar: 'outlook', ageRange: '26–35' };
    const put = await handleProfileApi({ method: 'PUT', body: { profile }, userId: 'u1' });
    expect(put).toEqual({ status: 200, json: { ok: true, profile: { ...profile, homeZipOrLocation: 'Ghent' } } });
    const get = await handleProfileApi({ method: 'GET', body: null, userId: 'u1' });
    expect(get.json.profile).toEqual({ ...profile, homeZipOrLocation: 'Ghent' });
    expect(db.statements.some((s) => s.includes('ADD COLUMN IF NOT EXISTS has_pet'))).toBe(true);
  });

  it('returns null (not defaults) when nothing is stored yet', async () => {
    expect((await handleProfileApi({ method: 'GET', body: null, userId: 'nobody' })).json).toEqual({ ok: true, profile: null });
  });

  it('drops unknown fields and invalid values', () => {
    expect(sanitizeOnboardingProfile({ hasPet: 'yes', family_structure: 'aliens', isAdmin: true, primaryCalendar: 'google' })).toEqual({ primaryCalendar: 'google' });
    expect(sanitizeOnboardingProfile({ isAdmin: true })).toBeNull();
    expect(sanitizeOnboardingProfile('x')).toBeNull();
  });
});
