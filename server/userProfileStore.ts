import { query } from './db.js';
import type { OnboardingProfile } from '../src/types.js';
import { sanitizeOnboardingProfile } from '../src/utils/profileSanitize.js';

let schemaReady: Promise<void> | null = null;

/**
 * The onboarding profile (household, pets, home area, calendar), stored per
 * account so it survives signing in, other browsers and devices. It used to
 * live only in the browser, under a "guest" key when filled in before
 * sign-in - so after signing in, Settings found nothing and showed the
 * defaults. Idempotent and memoised, like the app's other runtime schema
 * helpers; the named columns keep it easy to report on in Neon.
 */
export function ensureUserProfileSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS user_profiles (
           user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
           home_location     TEXT,
           family_structure  TEXT,
           calendar_scope    TEXT,
           updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      );
      await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS age_range TEXT`);
      await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS has_pet BOOLEAN`);
      await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS primary_calendar TEXT`);
      await query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile JSONB`);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export async function getUserProfile(userId: string): Promise<OnboardingProfile | null> {
  await ensureUserProfileSchema();
  const rows = await query<{ profile: unknown }>(`SELECT profile FROM user_profiles WHERE user_id = $1`, [userId]);
  return rows[0] ? sanitizeOnboardingProfile(rows[0].profile) : null;
}

/** Stores a (sanitized) profile; returns what was stored, or null if nothing valid was sent. */
export async function saveUserProfile(userId: string, raw: unknown): Promise<OnboardingProfile | null> {
  const profile = sanitizeOnboardingProfile(raw);
  if (!profile) return null;
  await ensureUserProfileSchema();
  await query(
    `INSERT INTO user_profiles (user_id, home_location, family_structure, calendar_scope, age_range, has_pet, primary_calendar, profile, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (user_id) DO UPDATE SET
       home_location = EXCLUDED.home_location,
       family_structure = EXCLUDED.family_structure,
       calendar_scope = EXCLUDED.calendar_scope,
       age_range = EXCLUDED.age_range,
       has_pet = EXCLUDED.has_pet,
       primary_calendar = EXCLUDED.primary_calendar,
       profile = EXCLUDED.profile,
       updated_at = now()`,
    [
      userId,
      profile.homeZipOrLocation || null,
      profile.family_structure || null,
      profile.calendar_type || null,
      profile.ageRange || null,
      typeof profile.hasPet === 'boolean' ? profile.hasPet : null,
      profile.primaryCalendar || null,
      JSON.stringify(profile),
    ]
  );
  return profile;
}

/**
 * GET: the signed-in user's stored profile (null if none yet).
 * PUT: store the profile from the body. Shared by the Vercel function and
 * server.ts, like server/eventsApi.ts.
 */
export async function handleProfileApi(input: { method: string; body: any; userId: string | null }): Promise<{ status: number; json: any }> {
  if (!input.userId) return { status: 401, json: { ok: false, error: 'Unauthorized' } };
  if (input.method === 'GET') {
    return { status: 200, json: { ok: true, profile: await getUserProfile(input.userId) } };
  }
  if (input.method === 'PUT' || input.method === 'POST') {
    const saved = await saveUserProfile(input.userId, input.body?.profile);
    return saved
      ? { status: 200, json: { ok: true, profile: saved } }
      : { status: 400, json: { ok: false, error: 'No valid profile fields.' } };
  }
  return { status: 405, json: { ok: false, error: 'Method not allowed' } };
}
