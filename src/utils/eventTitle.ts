/**
 * New-event titles follow one method: What – When – Where (when known).
 *   "Dentist appointment – Tue 6 Oct"
 *   "Dinner with Sarah – Fri 2 Oct – Antwerp"
 *   "Trip to Amsterdam – 15 Oct"
 * "What" is the model's own title when it is specific, else the activity
 * taken from the user's own words. A bare category label ("Calendar Event",
 * "Upcoming Event", "Travel & Vacation Trip") is never used as the What.
 */

const GENERIC_TITLES = new RegExp(
  '^(' +
    [
      'upcoming( event)?',
      'new( event)?',
      'event',
      'calendar event',
      'group trip horizon',
      'travel\\s*(&|and)\\s*vacation\\s*trip',
      'vacation trip',
      'travel trip',
      'trip',
      'birthday celebration',
      'hosting visitors\\s*(&|and)\\s*guests',
      'concert\\s*(&|and)\\s*festival event',
      'dinner\\s*(&|and)\\s*social gathering',
      'project\\s*(&|and)\\s*milestone',
      'service\\s*(&|and)\\s*maintenance',
      'subscription review',
      'untitled( event)?',
      'plan',
    ].join('|') +
    ')$',
  'i'
);

export function isGenericTitle(title: string | null | undefined): boolean {
  const t = (title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return !t || GENERIC_TITLES.test(t);
}

const WEEKDAYS = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)';
const MONTHS =
  '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|januari|februari|maart|mei|juni|juli|augustus|oktober)';

/** Date and time phrases: "next Tuesday", "on 14 October", "at 10", "tomorrow morning". */
const WHEN_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:on|from|this|next|coming)?\\s*(?:next|this|coming)?\\s*${WEEKDAYS}\\b(?:\\s+(?:morning|afternoon|evening|night))?`, 'gi'),
  new RegExp(`\\b(?:on|from|by|until|till|to)?\\s*\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTHS}\\b(?:\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b(?:on|from|by|until|till|to)?\\s*${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, 'gi'),
  /\b(?:on|from|by)?\s*\d{4}-\d{2}-\d{2}\b/gi,
  /\b(?:on|from|by)?\s*\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/gi,
  /\b(?:today|tonight|tomorrow|day after tomorrow)(?:\s+(?:morning|afternoon|evening|night))?\b/gi,
  /\b(?:this|next|coming)\s+(?:week(?:end)?|month|year)\b/gi,
  /\bin\s+(?:a|one|two|three|four|five|six|\d+)\s+(?:days?|weeks?|months?)\b/gi,
  /\b(?:at|around|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|h|u)?\b/gi,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
];

const LEADING_FILLER =
  /^(?:(?:hey|hi|hello|please|so|ok|okay)[,!]?\s+)*(?:can you\s+|could you\s+|help me\s+|i want you to\s+)?(?:please\s+)?(?:plan|prepare|organi[sz]e|schedule|book|add|create|make|set up|remind me (?:of|about|to))?\s*(?:for\s+)?(?:i\s+(?:have|got|need to|want to|am going to|'m going to|will)|i'm|i am|we\s+(?:have|are|need to|will)|we're|there(?:'s| is)|my|our|a|an|the)?\s*/i;

/**
 * The "What" and "Where" in the user's own words, from the first line of
 * their message (chat tags like [date: ...] removed).
 */
export function extractWhatWhere(message: string | null | undefined): { what: string | null; where: string | null } {
  let text = String(message || '')
    .replace(/\[[a-zA-Z0-9_-]+:\s*[^\]]*\]/g, ' ')
    .split('\n')[0]
    .split(/[.!?]\s/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { what: null, where: null };

  // Where: "in Antwerp", "at Google in Brussels" -> the last "in <Place>".
  let where: string | null = null;
  // Where: "in Antwerp" is cut from the What; "trip to Egypt" keeps it
  // ("Divetrip to Egypt" is the What, and the place isn't repeated).
  const inPlace = text.match(/\b(in|to)\s+((?:[A-Z][\p{L}'-]*)(?:[\s,]+(?:[A-Z][\p{L}'-]*|de|la|le|am|upon|aan|den))*)\s*$/u);
  if (inPlace) {
    where = inPlace[2].replace(/[\s,]+$/, '').trim();
    if (inPlace[1] === 'in') text = text.slice(0, inPlace.index).trim();
  }

  for (const re of WHEN_PATTERNS) text = text.replace(re, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(LEADING_FILLER, '').trim();
  text = text.replace(/^(?:a|an|the|my|our|some)\s+/i, '').trim();
  // Dangling joiners left behind by removed phrases.
  text = text.replace(/\s+(?:on|at|from|for|in|by|the|and|,)\s*$/i, '').replace(/^(?:for|on|at)\s+/i, '').trim();
  text = text.replace(/[,;:\s-]+$/, '').trim();

  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return { what: null, where };
  const what = words.slice(0, 7).join(' ');
  return { what: what.charAt(0).toUpperCase() + what.slice(1), where };
}

/** "Tue 6 Oct" (the year only when it isn't this year). */
export function shortEventDate(dateIso: string | null | undefined, referenceIso?: string): string | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return null;
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const refYear = referenceIso ? new Date(referenceIso).getFullYear() : new Date().getFullYear();
  const withYear = d.getFullYear() !== refYear;
  const text = d.toLocaleDateString('en-GB', {
    weekday: withYear ? undefined : 'short',
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
  });
  return text.replace(',', '');
}

/** What – When – Where. The place is left out when the What already names it. */
export function composeEventTitle(
  what: string,
  dateIso?: string | null,
  where?: string | null,
  endDateIso?: string | null,
  referenceIso?: string
): string {
  const trimmed = what.trim().replace(/\s*[–-]\s*$/, '');
  const cleanWhat = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const start = shortEventDate(dateIso, referenceIso);
  const end = endDateIso && endDateIso !== dateIso ? shortEventDate(endDateIso, referenceIso) : null;
  let when = start;
  if (start && end) {
    // A trip: "15–21 Oct", or "28 Oct–3 Nov" across months.
    const [s0, e0] = [new Date(`${dateIso!.slice(0, 10)}T12:00:00`), new Date(`${endDateIso!.slice(0, 10)}T12:00:00`)];
    const dm = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    when =
      s0.getMonth() === e0.getMonth() && s0.getFullYear() === e0.getFullYear()
        ? `${s0.getDate()}–${dm(e0)}`
        : `${dm(s0)}–${dm(e0)}`;
  }
  const place = where && !cleanWhat.toLowerCase().includes(where.toLowerCase()) ? where.trim() : null;
  return [cleanWhat, when, place].filter(Boolean).join(' – ');
}

/**
 * The title for a NEW event: the model's title when it is specific, else
 * the user's own words, else the fallback (e.g. "Trip to Egypt"), always
 * as What – When – Where.
 */
export function newEventTitle(params: {
  modelTitle?: string | null;
  message?: string | null;
  fallbackWhat?: string | null;
  location?: string | null;
  eventDate?: string | null;
  endDate?: string | null;
  referenceIso?: string;
}): string {
  const fromMessage = extractWhatWhere(params.message);
  const said = String(params.message || '').toLowerCase();
  // A title that is just the user's sentence copied ("I have a job interview
  // at 10") is replaced by the cleaned activity from that sentence.
  const usable = (t: string | null | undefined): string | null => {
    const v = (t || '').trim();
    if (isGenericTitle(v)) return null;
    const words = v.toLowerCase().split(/\s+/).filter(Boolean);
    const cleaned = (fromMessage.what || '').toLowerCase().split(/\s+/).filter(Boolean);
    // Copied (with date/time/filler words still in it): every word is from the
    // message and it's longer than the cleaned activity.
    if (cleaned.length > 0 && words.every((w) => said.includes(w)) && words.length > cleaned.length) return null;
    return v;
  };
  const what = usable(params.modelTitle) || usable(params.fallbackWhat) || fromMessage.what || 'Plan';
  // A model title that already carries a date or " – " is used as is.
  if (/\s[–-]\s/.test(what) || /\b\d{1,2}\s+[A-Z][a-z]{2}\b/.test(what)) return what;
  return composeEventTitle(what, params.eventDate, params.location || fromMessage.where, params.endDate, params.referenceIso);
}

/** Just the What of a What – When – Where title, for task names ("Advance planning for Job interview"). */
export function titleWhat(title: string | null | undefined): string {
  return String(title || '').split(' – ')[0].trim();
}
