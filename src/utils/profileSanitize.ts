import type { OnboardingProfile } from '../types.js';

// Whitelist of profile fields and their allowed values, applied to anything
// coming from a request body before it is stored (server) or trusted.
const AGE_RANGES = ['18–25', '26–35', '36–50', '51+'];
const FAMILY_STRUCTURES = ['single', 'couple', 'family_with_kids'];
const CALENDAR_SCOPES = ['personal', 'mixed', 'business'];
const FAMILY_STATUSES = ['Single', 'Couple', 'Family with kids', 'Couple with kids'];
const CALENDAR_TYPES = ['Personal', 'Mixed (Personal & Work)', 'Business', 'Personal only', 'Business only'];
const PRIMARY_CALENDARS = ['google', 'outlook', 'apple', 'other'];

const pick = <T extends string>(value: unknown, allowed: string[]): T | undefined =>
  typeof value === 'string' && allowed.includes(value) ? (value as T) : undefined;

/** A clean OnboardingProfile with only known fields, or null if nothing valid remains. */
export function sanitizeOnboardingProfile(raw: unknown): OnboardingProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const profile: OnboardingProfile = {
    ageRange: pick(r.ageRange, AGE_RANGES),
    family_structure: pick(r.family_structure, FAMILY_STRUCTURES),
    calendar_type: pick(r.calendar_type, CALENDAR_SCOPES),
    homeZipOrLocation: typeof r.homeZipOrLocation === 'string' ? r.homeZipOrLocation.trim().slice(0, 120) : undefined,
    hasPet: typeof r.hasPet === 'boolean' ? r.hasPet : undefined,
    primaryCalendar: pick(r.primaryCalendar, PRIMARY_CALENDARS),
    familyStatus: pick(r.familyStatus, FAMILY_STATUSES),
    calendarType: pick(r.calendarType, CALENDAR_TYPES),
    privacyConsentAccepted: typeof r.privacyConsentAccepted === 'boolean' ? r.privacyConsentAccepted : undefined,
    completedAt: typeof r.completedAt === 'string' && !isNaN(Date.parse(r.completedAt)) ? r.completedAt : undefined,
  };
  const cleaned = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)) as OnboardingProfile;
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}
