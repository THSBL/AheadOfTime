import { OnboardingProfile, FamilyStructure, CalendarTypeScope } from '../types';

export interface PromptPreset {
  id: string;
  title: string;
  shortTitle?: string;
  category: 'birthday_party' | 'hosting_visitors' | 'friends_family' | 'hobbies' | 'travel_trip' | 'project_deadline' | 'booking_trip' | 'subscription' | 'maintenance' | 'kids_school' | 'kids_hobbies' | 'custom';
  modeExpected: 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED';
  prompt: string;
  icon: string;
  emoji: string;
  description: string;
  whoLabel: string;
  whoPlaceholder: string;
  whenLabel: string;
  badge?: string;
  subPresets?: PromptPreset[];
}

/**
 * =========================================================================
 * 1. UPDATED CORE PRESET CATALOGUE
 * =========================================================================
 */

// 1. Party (Birthdays, weddings, dinners, milestone celebrations)
export const PRESET_PARTY: PromptPreset = {
  id: 'birthday',
  title: 'Party',
  shortTitle: 'Party',
  category: 'birthday_party',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Party celebration for [who] on [date]',
  icon: 'Cake',
  emoji: '🎉',
  description: 'Birthdays, weddings, dinners & milestone celebrations.',
  whoLabel: 'Who or what occasion is the party for?',
  whoPlaceholder: 'e.g. Maya & Liam Wedding, Dad 60th, Sarah Birthday Dinner',
  whenLabel: 'When is the party date?'
};

// 2. Friends / Family Visit (with Hosting vs Visiting contextual discriminator)
export const PRESET_FRIENDS_FAMILY: PromptPreset = {
  id: 'friends',
  title: 'Friends / Family Visit',
  shortTitle: 'Friends / Family',
  category: 'hosting_visitors',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Friends & family visit: [who] starting [date]',
  icon: 'Users',
  emoji: '🏡',
  description: 'Hosting guests at home, or visiting & staying with friends/family.',
  whoLabel: 'Who is visiting or who are you staying with?',
  whoPlaceholder: 'e.g. Alex & Sarah, Grandparents, College friends',
  whenLabel: 'When does the visit begin?'
};

export const PRESET_FRIENDS = PRESET_FRIENDS_FAMILY;

// 3. Hobbies (Sports tournaments, race prep, outdoor trips, musical gigs, craft workshops)
export const PRESET_HOBBIES: PromptPreset = {
  id: 'hobbies',
  title: 'Hobbies',
  shortTitle: 'Hobbies',
  category: 'hobbies',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Hobby event prep for [who] on [date]',
  icon: 'Trophy',
  emoji: '🏅',
  description: 'Sports tournaments, race prep, outdoor trips, musical gigs & workshops.',
  whoLabel: 'What tournament, race, gig, or workshop is this?',
  whoPlaceholder: 'e.g. Half Marathon Prep, Tennis Club Championship, Jazz Gig, Pottery Workshop',
  whenLabel: 'When is the event or competition date?'
};

// 4. Work / Projects (Launches, sprints, onboarding runways, deterministic CSV/XLSX workflows)
export const PRESET_WORK_PROJECTS: PromptPreset = {
  id: 'project',
  title: 'Work / Projects',
  shortTitle: 'Work (Projects)',
  category: 'project_deadline',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Work project milestone for [who] on [date]',
  icon: 'Rocket',
  emoji: '📊',
  description: 'Launches, sprints, onboarding runways & deterministic CSV/XLSX workflows.',
  whoLabel: 'What is the project milestone / deliverable?',
  whoPlaceholder: 'e.g. Mobile App v2.0 Release, Q4 Sales Kickoff Deck, SOC2 Audit',
  whenLabel: 'When is the target deadline date?'
};

export const PRESET_PROJECT = PRESET_WORK_PROJECTS;

// 5. Subscriptions (Trial cancellation cutoffs, annual renewal review milestones)
export const PRESET_SUBSCRIPTION: PromptPreset = {
  id: 'subscription',
  title: 'Subscriptions',
  shortTitle: 'Subscriptions',
  category: 'subscription',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Subscription cancellation check for [who] before renewal on [date]',
  icon: 'CreditCard',
  emoji: '💳',
  description: 'Trial cancellation cutoffs & annual renewal review milestones.',
  whoLabel: 'Which subscription or recurring service?',
  whoPlaceholder: 'e.g. Netflix, Equinox Gym, Adobe Creative Cloud, Amazon Prime',
  whenLabel: 'When does the renewal or billing cycle end?'
};

// 6. Maintenance (Vehicle service, home inspections, seasonal upkeep checkpoints)
export const PRESET_MAINTENANCE: PromptPreset = {
  id: 'maintenance',
  title: 'Maintenance',
  shortTitle: 'Maintenance',
  category: 'maintenance',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Maintenance service for [who] on [date]',
  icon: 'Wrench',
  emoji: '🔧',
  description: 'Vehicle service, home inspections & seasonal upkeep checkpoints.',
  whoLabel: 'What requires service or maintenance?',
  whoPlaceholder: 'e.g. Car 30k Mile Service & MOT, HVAC Annual Inspection, Boiler Check',
  whenLabel: 'Target service or maintenance date?'
};

// Travel / Trip (Always included for all users - Solo, Couple, Family, Business)
export const PRESET_TRIP: PromptPreset = {
  id: 'trip',
  title: 'Trips & Travel',
  shortTitle: 'Trips',
  category: 'travel_trip',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Trip to [who] on [date]',
  icon: 'Plane',
  emoji: '✈️',
  description: 'Vacations, getaways, business trips, flight bookings & packing checklists.',
  whoLabel: 'Where are you traveling / destination?',
  whoPlaceholder: 'e.g. Brooklyn NY, Tokyo, London, Client Conference',
  whenLabel: 'When is the departure date?'
};

/**
 * =========================================================================
 * DEDICATED KIDS SUB-PRESETS (Rule A - Injected for Family with Kids)
 * =========================================================================
 */
export const PRESET_KIDS_SCHOOL: PromptPreset = {
  id: 'kids_school',
  title: 'Kids: School',
  shortTitle: 'School',
  category: 'kids_school',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Kids school event: [who] on [date]',
  icon: 'GraduationCap',
  emoji: '🎒',
  description: 'Theme days, science fairs, presentations & parent-teacher reviews.',
  whoLabel: 'Which child and school event / project?',
  whoPlaceholder: 'e.g. Leo Book Week costume, Maya Science Fair project, Term 3 Review',
  whenLabel: 'When is the school event or project deadline?'
};

export const PRESET_KIDS_HOBBIES: PromptPreset = {
  id: 'kids_hobbies',
  title: 'Kids: Hobbies',
  shortTitle: 'Kids Hobbies',
  category: 'kids_hobbies',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Kids hobby / sports event: [who] on [date]',
  icon: 'Trophy',
  emoji: '⚽',
  description: 'Youth matches, tournaments, kit checks & transport pooling.',
  whoLabel: 'Which child, tournament, match, or recital?',
  whoPlaceholder: 'e.g. Maya Soccer Tournament, Leo Piano Recital, Swim Club Finals',
  whenLabel: 'When is the tournament or recital date?'
};

export const PRESET_KIDS: PromptPreset = {
  id: 'kids',
  title: 'Kids',
  shortTitle: 'Kids',
  category: 'kids_school',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Kids activity prep for [who] on [date]',
  icon: 'Sparkles',
  emoji: '🧸',
  description: 'School events, costume days, youth tournaments & recital runways.',
  whoLabel: 'Which child and activity?',
  whoPlaceholder: 'e.g. Leo Book Week, Maya Soccer Finals, Science Project',
  whenLabel: 'When is the target event date?',
  subPresets: [PRESET_KIDS_SCHOOL, PRESET_KIDS_HOBBIES]
};

/**
 * Normalizes any profile object (legacy or new) to standard technical schema
 */
export function normalizeProfile(profile?: Partial<OnboardingProfile> | null): {
  family_structure: FamilyStructure;
  calendar_type: CalendarTypeScope;
  homeZipOrLocation: string;
} {
  let family_structure: FamilyStructure = 'single';
  let calendar_type: CalendarTypeScope = 'personal';
  let homeZipOrLocation = '';

  if (profile) {
    if (profile.homeZipOrLocation) {
      homeZipOrLocation = profile.homeZipOrLocation;
    }

    if (profile.family_structure) {
      family_structure = profile.family_structure;
    } else if (profile.familyStatus) {
      const fs = profile.familyStatus.toLowerCase();
      if (fs.includes('kid') || fs.includes('family') || fs.includes('parent') || fs.includes('couple with kids')) {
        family_structure = 'family_with_kids';
      } else if (fs.includes('couple')) {
        family_structure = 'couple';
      } else {
        family_structure = 'single';
      }
    }

    if (profile.calendar_type) {
      calendar_type = profile.calendar_type;
    } else if (profile.calendarType) {
      const ct = profile.calendarType.toLowerCase();
      if (ct.includes('mixed')) {
        calendar_type = 'mixed';
      } else if (ct.includes('business') || ct.includes('work')) {
        calendar_type = 'business';
      } else {
        calendar_type = 'personal';
      }
    }
  }

  return { family_structure, calendar_type, homeZipOrLocation };
}

export interface CategorizedPresets {
  primary: PromptPreset[];
  secondary: PromptPreset[];
  all: PromptPreset[];
  hasKids: boolean;
  hasProject: boolean;
  canImportSpreadsheet: boolean;
  isPersonalOnly: boolean;
  familyStructure: FamilyStructure;
  calendarType: CalendarTypeScope;
  homeZipOrLocation: string;
}

/**
 * =========================================================================
 * 2. DEMOGRAPHIC FILTERING & ADAPTIVE PRESET ENGINE
 * =========================================================================
 */
export function getCategorizedPresets(profile?: Partial<OnboardingProfile> | null): CategorizedPresets {
  const { family_structure, calendar_type, homeZipOrLocation } = normalizeProfile(profile);
  const isPersonalOnly = calendar_type === 'personal';
  const hasKids = family_structure === 'family_with_kids';
  const hasProject = !isPersonalOnly;
  const canImportSpreadsheet = !isPersonalOnly;

  // Baseline primary presets present across profiles (including Trips & Travel)
  const primary: PromptPreset[] = [
    PRESET_PARTY,
    PRESET_FRIENDS_FAMILY,
    PRESET_HOBBIES,
    PRESET_TRIP,
  ];

  // Rule B: Retain Work / Projects for Mixed or Business
  if (hasProject) {
    primary.push(PRESET_WORK_PROJECTS);
  }

  // Rule A: Kids Profiling (Inject into primary when family with kids)
  if (hasKids) {
    primary.push(PRESET_KIDS_SCHOOL);
    primary.push(PRESET_KIDS_HOBBIES);
  }

  let secondary: PromptPreset[] = [];

  if (isPersonalOnly) {
    primary.push(PRESET_SUBSCRIPTION);
    primary.push(PRESET_MAINTENANCE);
  } else {
    secondary = [PRESET_SUBSCRIPTION, PRESET_MAINTENANCE];
  }

  const all = [...primary, ...secondary];

  return {
    primary,
    secondary,
    all,
    hasKids,
    hasProject,
    canImportSpreadsheet,
    isPersonalOnly,
    familyStructure: family_structure,
    calendarType: calendar_type,
    homeZipOrLocation,
  };
}

/**
 * Pure selector function returning the adaptive list of presets based on profile
 */
export function getAdaptivePresets(profile?: Partial<OnboardingProfile> | null): PromptPreset[] {
  const { primary, secondary } = getCategorizedPresets(profile);
  return [...primary, ...secondary];
}

/**
 * Backwards-compatible alias for getAdaptivePresets
 */
export function getVisiblePresets(profile?: Partial<OnboardingProfile> | null): PromptPreset[] {
  return getAdaptivePresets(profile);
}

// Backwards-compatible legacy exports
export const EVENT_PRESETS: PromptPreset[] = [
  PRESET_PARTY,
  PRESET_FRIENDS_FAMILY,
  PRESET_HOBBIES,
  PRESET_WORK_PROJECTS,
];

export const SMALL_PRESETS: PromptPreset[] = [
  PRESET_SUBSCRIPTION,
  PRESET_MAINTENANCE,
];

export const QUICK_OPTIONS = [
  {
    id: 'subscription',
    title: 'Subscriptions',
    emoji: '💳',
    prompt: 'Subscription cancellation check for unused streaming, gym, or SaaS services.',
    category: 'custom'
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    emoji: '🔧',
    prompt: 'Schedule car service, AC filter check, and home maintenance inspection.',
    category: 'custom'
  },
  {
    id: 'hobbies',
    title: 'Hobbies',
    emoji: '🏅',
    prompt: 'Plan gear, registration, and logistics for upcoming tournament or race.',
    category: 'custom'
  }
];

export const SAMPLE_PRESETS: PromptPreset[] = EVENT_PRESETS;
export const INITIAL_EVENTS: any[] = [];
