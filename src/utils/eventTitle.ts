/**
 * New-event titles follow one method: Where – What – When. The place only
 * when known; the What short and in the user's own words.
 *   "Portugal – Family trip – Jul 2027"
 *   "Antwerp – Dinner with Sarah – Fri 2 Oct"
 *   "Dentist appointment – Tue 6 Oct"
 * "What" is the model's own title when it is specific, else the activity
 * from the user's message. A bare category or template label ("Calendar
 * Event", "Vacation & Holiday Getaway") is never used as the What.
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
      'vacation\\s*(&|and)\\s*holiday getaway',
      'stag party weekend',
      'bachelorette weekend getaway',
      'conference\\s*(&|and)\\s*industry summit',
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

/** "Vacation & Holiday Getaway (Portugal)" -> label and place apart. */
function splitParenthetical(title: string): { label: string; place: string | null } {
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { label: m[1].trim(), place: m[2].trim() } : { label: title.trim(), place: null };
}

export function isGenericTitle(title: string | null | undefined): boolean {
  const t = splitParenthetical((title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()).label;
  return !t || GENERIC_TITLES.test(t);
}

const WEEKDAYS = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)';
const MONTHS =
  '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|januari|februari|maart|mei|juni|juli|augustus|oktober)';

/** Date and time phrases: "next Tuesday", "on 14 October", "in July 2027", "at 10". */
const WHEN_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:on|from|this|next|coming)?\\s*(?:next|this|coming)?\\s*${WEEKDAYS}\\b(?:\\s+(?:morning|afternoon|evening|night))?`, 'gi'),
  new RegExp(`\\b(?:on|from|by|until|till|to)?\\s*\\d{1,2}(?:st|nd|rd|th)?(?:\\s*(?:-|–|to|until)\\s*\\d{1,2}(?:st|nd|rd|th)?)?\\s+(?:of\\s+)?${MONTHS}\\b(?:\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b(?:on|from|by|until|till|to)?\\s*${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b(?:in|during|around|early|mid|late|end of|this|next)\\s+${MONTHS}\\b(?:\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b${MONTHS}\\s+\\d{4}\\b`, 'gi'),
  /\b(?:on|from|by)?\s*\d{4}-\d{2}-\d{2}\b/gi,
  /\b(?:on|from|by)?\s*\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/gi,
  /\b(?:today|tonight|tomorrow|day after tomorrow)(?:\s+(?:morning|afternoon|evening|night))?\b/gi,
  /\b(?:early|mid|late|end of)?\s*(?:this|next|coming)\s+(?:week(?:end)?|month|year)\b/gi,
  /\bin\s+(?:a|one|two|three|four|five|six|\d+)\s+(?:days?|weeks?|months?)\b/gi,
  /\b(?:at|around|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|h|u)?\b/gi,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
];

/** The date is a whole month ("in July 2027", "next month"), not a day. */
function saysMonthOnly(message: string): boolean {
  const text = String(message || '');
  const withDay =
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:-|–|to|until)?\\s*(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?:of\\s+)?${MONTHS}\\b`, 'i').test(text) ||
    new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?!\\d)`, 'i').test(text.replace(new RegExp(`${MONTHS}\\s+\\d{4}`, 'gi'), ''));
  if (withDay) return false;
  return (
    new RegExp(`\\b(?:in|during|around|early|mid|late|end of|this|next)\\s+${MONTHS}\\b`, 'i').test(text) ||
    new RegExp(`\\b${MONTHS}\\s+\\d{4}\\b`, 'i').test(text) ||
    /\bnext\s+month\b/i.test(text)
  );
}

const LEADING_FILLER =
  /^(?:(?:hey|hi|hello|please|so|ok|okay)[,!]?\s+)*(?:can you\s+|could you\s+|help me\s+|i want you to\s+)?(?:please\s+)?(?:plan|prepare|organi[sz]e|schedule|book|add|create|make|set up|remind me (?:of|about|to))?\s*(?:for\s+)?(?:i\s+(?:have|got|need to|want to|am going to|'m going to|will)|i'm|i am|we\s+(?:have|are|need to|will)|we're|there(?:'s| is)|my|our|a|an|the)?\s*/i;

/** A capitalised place after "in"/"to": "Portugal", "New York", "Antwerp". */
const PLACE = /\b(?:in|to)\s+((?:[A-Z][\p{L}'-]*)(?:\s+(?:[A-Z][\p{L}'-]*|de|la|le|am|upon|aan|den))*)/gu;

/**
 * The "What" and "Where" in the user's own words, from the first sentence
 * of their message (chat tags like [date: ...] removed).
 */
export function extractWhatWhere(message: string | null | undefined): { what: string | null; where: string | null } {
  let text = String(message || '')
    .replace(/\[[a-zA-Z0-9_-]+:\s*[^\]]*\]/g, ' ')
    .split('\n')[0]
    .split(/[.!?]\s|,\s/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { what: null, where: null };

  for (const re of WHEN_PATTERNS) text = text.replace(re, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  // Where: the last "in/to <Place>"; it leaves the What ("Family trip").
  let where: string | null = null;
  const places = [...text.matchAll(PLACE)];
  const last = places[places.length - 1];
  if (last && last.index !== undefined) {
    where = last[1].trim();
    text = `${text.slice(0, last.index)} ${text.slice(last.index + last[0].length)}`.replace(/\s+/g, ' ').trim();
  }

  text = text.replace(LEADING_FILLER, '').trim();
  text = text.replace(/^(?:a|an|the|my|our|some)\s+/i, '').trim();
  // Dangling joiners left behind by removed phrases.
  text = text.replace(/\s+(?:on|at|from|for|in|to|by|the|and|,)\s*$/i, '').replace(/^(?:for|on|at)\s+/i, '').trim();
  text = text.replace(/[,;:\s-]+$/, '').trim();

  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return { what: null, where };
  const what = words.slice(0, 6).join(' ');
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

function whenLabel(dateIso?: string | null, endDateIso?: string | null, referenceIso?: string, monthOnly?: boolean): string | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return null;
  const s0 = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  if (monthOnly) {
    const refYear = referenceIso ? new Date(referenceIso).getFullYear() : new Date().getFullYear();
    return s0.toLocaleDateString('en-GB', { month: 'short', year: s0.getFullYear() !== refYear ? 'numeric' : undefined });
  }
  const start = shortEventDate(dateIso, referenceIso);
  if (!endDateIso || endDateIso.slice(0, 10) === dateIso.slice(0, 10)) return start;
  // A trip: "15–21 Oct", or "28 Oct–3 Nov" across months.
  const e0 = new Date(`${endDateIso.slice(0, 10)}T12:00:00`);
  if (isNaN(e0.getTime())) return start;
  const dm = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return s0.getMonth() === e0.getMonth() && s0.getFullYear() === e0.getFullYear() ? `${s0.getDate()}–${dm(e0)}` : `${dm(s0)}–${dm(e0)}`;
}

/** Where – What – When. The place moves out of the What ("Trip to Lisbon" -> "Lisbon – Trip"). */
export function composeEventTitle(
  what: string,
  dateIso?: string | null,
  where?: string | null,
  endDateIso?: string | null,
  referenceIso?: string,
  monthOnly?: boolean
): string {
  let core = what.trim().replace(/\s*[–-]\s*$/, '');
  const place = (where || '').trim() || null;
  if (place) {
    const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const without = core.replace(new RegExp(`\\s*\\b(?:to|in|at)\\s+${escaped}\\b`, 'i'), '').replace(new RegExp(`\\s*\\(${escaped}\\)`, 'i'), '').trim();
    core = without || core;
  }
  core = core.charAt(0).toUpperCase() + core.slice(1);
  const showPlace = place && !core.toLowerCase().includes(place.toLowerCase()) ? place : null;
  return [showPlace, core, whenLabel(dateIso, endDateIso, referenceIso, monthOnly)].filter(Boolean).join(' – ');
}

/**
 * The title for a NEW event: the model's title when it is specific, else
 * the user's own words, else the fallback (e.g. "Trip to Egypt"), always
 * as Where – What – When.
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
  const templatePlace = [params.modelTitle, params.fallbackWhat].map((t) => splitParenthetical(t || '').place).find(Boolean);
  const where = cleanPlace(params.location) || fromMessage.where || cleanPlace(templatePlace);
  return composeEventTitle(what, params.eventDate, where, params.endDate, params.referenceIso, saysMonthOnly(params.message || ''));
}

/**
 * An explicit rename in a chat change: "rename it to Family trip to Portugal",
 * "call it Portugal 2027", "change the title to ...". Null when there's none.
 */
export function detectRename(message: string | null | undefined): string | null {
  const text = String(message || '');
  const patterns = [
    /\b(?:rename|re-name|retitle)\b(?:\s+(?:it|this|the\s+(?:event|trip|plan)|my\s+(?:event|trip|plan)))?\s+(?:to|as|into)\s+["“'‘]?(.+?)["”'’]?\s*(?:$|[.;!\n]|,?\s+and\s|,?\s+then\s|,\s)/i,
    /\bcall\s+(?:it|this|the\s+(?:event|trip|plan))\s+["“'‘]?(.+?)["”'’]?\s*(?:$|[.;!\n]|,?\s+and\s|,?\s+then\s|,\s)/i,
    /\b(?:change|set|update)\s+the\s+(?:title|name)\s+to\s+["“'‘]?(.+?)["”'’]?\s*(?:$|[.;!\n]|,?\s+and\s|,?\s+then\s|,\s)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const name = m?.[1]?.trim();
    if (name && name.length >= 2 && name.length <= 80) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}

/** "Portugal in" / "brooklyn ny" -> a tidy place name. */
function cleanPlace(place: string | null | undefined): string | null {
  const p = String(place || '').replace(/\s+(?:in|at|on|for|from|with|to|and)$/i, '').trim();
  if (!p) return null;
  return p.replace(/\b([a-z])/g, (_, l) => l.toUpperCase());
}

const DATE_PART = new RegExp(`^(?:\\d|${MONTHS}\\b|${WEEKDAYS}\\b)`, 'i');

/** Just the What of a Where – What – When title, for task names ("Advance planning for Family trip"). */
export function titleWhat(title: string | null | undefined): string {
  const parts = String(title || '').split(' – ').map((p) => p.trim()).filter(Boolean);
  const nonDate = parts.filter((p) => !DATE_PART.test(p));
  if (nonDate.length === 0) return parts[0] || '';
  // Where – What: the What is the last non-date part.
  return nonDate[nonDate.length - 1];
}
