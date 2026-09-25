import type { OnboardingProfile } from '../types';
import { getStoredAccessToken } from './googleAuth';

/**
 * Server copy of the onboarding profile (/api/telegram/profile), so it
 * follows the account across sign-in, browsers and devices. Every call is
 * best-effort: without a sign-in or network the browser copy keeps working.
 */
export async function fetchServerProfile(): Promise<{ ok: boolean; profile: OnboardingProfile | null }> {
  const token = getStoredAccessToken();
  if (!token) return { ok: false, profile: null };
  try {
    const res = await fetch('/api/telegram/profile', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false, profile: null };
    const data = await res.json();
    return { ok: Boolean(data?.ok), profile: data?.profile || null };
  } catch {
    return { ok: false, profile: null };
  }
}

export async function pushServerProfile(profile: OnboardingProfile): Promise<boolean> {
  const token = getStoredAccessToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/telegram/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
