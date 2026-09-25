/**
 * "Which calendar do you use?" - demand research for calendar providers
 * beyond Google (see docs/outlook-integration-plan.md). Shared by the
 * landing page, onboarding and the feedback page (client) and the anonymous
 * endpoint that stores the answers (server/calendarPollStore.ts).
 */
export const CALENDAR_CHOICES = ['google', 'outlook', 'apple', 'other'] as const;
export type CalendarChoice = (typeof CALENDAR_CHOICES)[number];

export const CALENDAR_CHOICE_LABELS: Record<CalendarChoice, string> = {
  google: 'Google Calendar',
  outlook: 'Outlook',
  apple: 'Apple Calendar',
  other: 'Something else',
};

export const CALENDAR_POLL_SOURCES = ['landing', 'onboarding', 'feedback'] as const;
export type CalendarPollSource = (typeof CALENDAR_POLL_SOURCES)[number];

export interface CalendarVoteInput {
  calendar: CalendarChoice;
  source: CalendarPollSource;
  visitorId: string;
  otherText?: string;
  notifyEmail?: string;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** Validates an untrusted request body; returns a clean vote or an error message. */
export function parseCalendarVote(raw: unknown): { vote: CalendarVoteInput } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Missing body.' };
  const r = raw as Record<string, unknown>;
  if (!CALENDAR_CHOICES.includes(r.calendar as CalendarChoice)) return { error: 'Unknown calendar.' };
  if (!CALENDAR_POLL_SOURCES.includes(r.source as CalendarPollSource)) return { error: 'Unknown source.' };
  if (typeof r.visitorId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(r.visitorId)) return { error: 'Invalid visitor id.' };
  const otherText = typeof r.otherText === 'string' && r.otherText.trim() ? r.otherText.trim().slice(0, 80) : undefined;
  let notifyEmail: string | undefined;
  if (typeof r.notifyEmail === 'string' && r.notifyEmail.trim()) {
    const email = r.notifyEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { error: 'That email address does not look right.' };
    notifyEmail = email;
  }
  return {
    vote: {
      calendar: r.calendar as CalendarChoice,
      source: r.source as CalendarPollSource,
      visitorId: r.visitorId,
      otherText: r.calendar === 'other' ? otherText : undefined,
      // Only asked for calendars we don't support yet.
      notifyEmail: r.calendar === 'google' ? undefined : notifyEmail,
    },
  };
}
