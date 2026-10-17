import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { detectEventCategory, parseNaturalDateRange, formatDisplayDate } from '../utils/tminusRules';
import type { EventCategory } from '../types';
import { isAwayFromHomeEvent } from '../utils/refinementQuestions';

/**
 * What the chat shows while the AI works (ChatConsole's creation thread):
 * an instant reply built on the device from the person's own words, the
 * plan's real shape (today -> the date) while the steps are made, and a
 * progress line tied to the stages. Nothing here is invented: every fact
 * shown was read from what they typed, and anything that can't be read is
 * simply left out.
 */

export interface MessageFacts {
  title: string;
  category: EventCategory;
  startDate?: string;
  endDate?: string;
  /** Their own words for a relative date ("in 6 weeks"): shown as said, never turned into a made-up exact day. */
  relative?: string;
  /** Only to size the runway for a relative date. */
  approxDate?: string;
  people?: string;
}

const PEOPLE = /\b(?:(?:for|with)\s+)?(?:(?:a\s+)?(?:group|party|bunch)\s+of\s+)?(\d{1,3})\s+(people|persons|friends|guests|kids|children|colleagues|adults|girls|boys|guys|ladies|lads|women|men)\b/i;
const PLAIN_WORDS = /^(the|a|an|my|our|your|their|his|her|be|see|visit|stay|town|work|school|bed)$/i;
const MONTH_PHRASE = /\b(?:in|this|next|during)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(?:next|this)\s+year|\s+\d{4})?\b/i;
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const RELATIVE = /\bin\s+(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|week|month)s?\b/i;
/** A date we can show as a day: it was written with a number, a month or a weekday - not just "weekend". */
const EXPLICIT = /\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|today/i;

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The title, dates and headcount we can read from a message - nothing more. */
export function readMessageFacts(text: string, referenceDateIso: string, extraText = ''): MessageFacts {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const people = clean.match(PEOPLE);
  const rel = clean.match(RELATIVE);
  let title = clean;
  const facts: Partial<MessageFacts> = {};
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : NUMBER_WORDS[rel[1].toLowerCase()] || 1;
    const unit = rel[2].toLowerCase();
    facts.relative = `in ${n} ${unit}${n === 1 ? '' : 's'}`;
    facts.approxDate = addDays(referenceDateIso, unit === 'day' ? n : unit === 'week' ? n * 7 : n * 30);
    title = title.replace(rel[0], ' ');
  } else {
    for (const source of [clean, extraText]) {
      const range = source ? parseNaturalDateRange(source, referenceDateIso) : null;
      if (!range?.startDate || !EXPLICIT.test(range.matchedText || '')) continue;
      if (range.precision === 'month') {
        // Only a month ("in August next year"): shown as the month, never as the 1st.
        if (!facts.relative) {
          facts.relative = new Date(`${range.startDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
          facts.approxDate = range.startDate.slice(0, 10);
          if (source === clean && range.matchedText) title = title.replace(range.matchedText, ' ');
        }
        continue;
      }
      delete facts.relative;
      delete facts.approxDate;
      facts.startDate = range.startDate.slice(0, 10);
      if (range.endDate && range.endDate.slice(0, 10) !== facts.startDate) facts.endDate = range.endDate.slice(0, 10);
      if (source === clean && range.matchedText) title = title.replace(range.matchedText, ' ');
      break;
    }
  }
  title = title
    .replace(PEOPLE, ' ')
    .replace(MONTH_PHRASE, ' ')
    .replace(/\b(?:next|this)\s+year\b/gi, ' ')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/^(hi|hey|hello)[,!\s]+/i, '')
    .replace(/^(i'?m|we'?re|i am|we are)\s+(planning|organi[sz]ing|hosting|going on|having)\s+/i, '')
    .replace(/^(my|our)\s+/i, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\b(on|from|for|in|at|this|next|with|around|by)\s*(?=[,.;:!?]|$)/gi, ' ')
    .replace(/[,.;:!?\s-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const trip = isAwayFromHomeEvent(clean);
  // A trip's place, typed in lowercase: "going to ibiza" -> "Going to Ibiza".
  if (trip) title = title.replace(/\b(to|in)\s+([a-z][a-z'-]{2,})\b/g, (m, w, word) => (PLAIN_WORDS.test(word) ? m : `${w} ${word.charAt(0).toUpperCase()}${word.slice(1)}`));
  if (title.length > 48) title = `${title.slice(0, 48).replace(/\s+\S*$/, '')}…`;
  return {
    title: title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Your plan',
    category: ((c) => (c === 'custom' && trip ? 'travel_trip' : c))(detectEventCategory(clean)),
    ...facts,
    ...(people ? { people: `${people[1]} ${people[2].toLowerCase()}` } : {}),
  };
}

const DAY = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const shortDate = (iso: string) => new Date(dayMs(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const LEAD_TIMES: Partial<Record<EventCategory, string>> = {
  travel_trip: 'travel and stays',
  booking_trip: 'bookings',
  birthday_party: 'invites, food and the venue',
  hosting_visitors: 'the guest room and food',
  friends_family: 'invites and bookings',
  dinner_social: 'the table and the guest list',
  festival_concert: 'tickets and travel',
  project_deadline: 'reviews and sign-offs',
  kids_school: 'forms and kit',
  kids_hobbies: 'kit and lifts',
  maintenance: 'bookings and suppliers',
};

/** The areas a plan of this kind covers: shown one by one while it's made. */
const AREAS: Partial<Record<EventCategory, string[]>> = {
  travel_trip: ['Documents', 'Getting there', 'Where to stay', 'Things to do', 'Money', 'Packing'],
  booking_trip: ['Options', 'Booking', 'Confirmations', 'The day itself'],
  birthday_party: ['Guest list', 'Place', 'Food and drinks', 'Invites', 'Gift', 'On the day'],
  hosting_visitors: ['Guest room', 'Food', 'Plans together', 'On arrival'],
  friends_family: ['Who comes', 'Place', 'Food', 'On the day'],
  dinner_social: ['Guest list', 'The table', 'Food and drinks', 'On the night'],
  festival_concert: ['Tickets', 'Travel', 'Stay', 'What to bring'],
  project_deadline: ['Scope', 'Reviews', 'Sign-offs', 'The launch'],
  kids_school: ['Forms', 'Kit', 'Lifts', 'The day itself'],
  kids_hobbies: ['Kit', 'Lifts', 'Snacks', 'The day itself'],
  maintenance: ['Quotes', 'Booking', 'Getting ready', 'The day itself'],
};
const DEFAULT_AREAS = ['The basics', 'What to book', 'What to buy', 'The week before', 'The day itself'];

/** "12–18 Aug 2027", "30 Jul – 2 Aug", "Fri 23 Oct": short, the year only when it's not this one. */
export function compactRange(start: string, end?: string): string {
  const d = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const a = d(start);
  const thisYear = new Date().getUTCFullYear();
  const month = (x: Date) => x.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const year = (x: Date) => (x.getUTCFullYear() !== thisYear ? ` ${x.getUTCFullYear()}` : '');
  if (!end || end.slice(0, 10) === start.slice(0, 10)) {
    return `${a.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${a.getUTCDate()} ${month(a)}${year(a)}`;
  }
  const b = d(end);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) return `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)}${year(b)}`;
  return `${a.getUTCDate()} ${month(a)}${a.getUTCFullYear() !== b.getUTCFullYear() ? year(a) : ''} – ${b.getUTCDate()} ${month(b)}${year(b)}`;
}

/** A reassuring line straight away, from their own facts only. */
export function reassurance(facts: MessageFacts | null): string {
  if (!facts) return "Got it. I'm working back from the date now; this usually takes 10 to 20 seconds.";
  const when = facts.startDate ? compactRange(facts.startDate, facts.endDate) : facts.relative || null;
  const bits = [facts.title, when, facts.people].filter(Boolean).join(', ');
  return `Got it: ${bits}. I'm working back from the date now; this usually takes 10 to 20 seconds.`;
}

export function statusLines(facts: MessageFacts | null): string[] {
  const date = facts?.startDate ? shortDate(facts.startDate) : null;
  return [
    date ? `Working back from ${date}…` : facts?.relative ? `Working back from ${facts.relative}…` : 'Working back from the date…',
    `Checking lead times for ${(facts && LEAD_TIMES[facts.category]) || 'this kind of event'}…`,
    'Adding ideas to each step…',
    'Putting the steps in order…',
  ];
}

/** Cycles through the lines, then stays on the last one. */
function useCycle(lines: string[], everyMs: number): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const id = window.setInterval(() => setI((n) => Math.min(n + 1, lines.length - 1)), everyMs);
    return () => window.clearInterval(id);
  }, [lines.join('|'), everyMs]);
  return lines[i];
}

const Avatar = () => (
  <div className="w-7 h-7 rounded-full bg-[#182A42] text-white flex items-center justify-center shrink-0 mr-2 shadow-xs ring-1 ring-white/15">
    <Sparkles className="w-3.5 h-3.5" />
  </div>
);

const Bar = ({ className = '' }: { className?: string }) => <div className={`aot-shimmer rounded-md ${className}`} />;

/** The instant reply: what we read from their message, with the questions on their way. */
export const AckBubble: React.FC<{ facts: MessageFacts; questionsLoading: boolean }> = ({ facts, questionsLoading }) => {
  const chips = [
    facts.startDate ? `${formatDisplayDate(facts.startDate)}${facts.endDate ? ` – ${formatDisplayDate(facts.endDate)}` : ''}` : facts.relative || null,
    facts.people || null,
    facts.startDate && facts.endDate ? `${Math.round((dayMs(facts.endDate) - dayMs(facts.startDate)) / DAY)} nights` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="flex justify-start aot-rise">
      <Avatar />
      <div className="max-w-[85%] bg-white border border-slate-200/90 text-slate-800 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-2xs space-y-2">
        <p className="text-sm font-black text-slate-900 leading-snug">{facts.title}</p>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-full px-2 py-0.5">
                {c}
              </span>
            ))}
          </div>
        )}
        {questionsLoading && (
          <div className="space-y-2 pt-1" aria-label="Getting a few quick questions" role="status">
            <Bar className="h-3 w-3/5" />
            <div className="flex gap-1.5">
              <Bar className="h-7 w-16 rounded-full" />
              <Bar className="h-7 w-20 rounded-full" />
              <Bar className="h-7 w-14 rounded-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** The plan's shape while the steps are made: the real runway, placeholder rows, a progress line. */
/** The first day of each month after `from`, up to `to`. */
function monthStarts(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
  for (let i = 0; i < 36; i++) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso >= to.slice(0, 10)) break;
    out.push(iso);
  }
  return out;
}

export const PlanPreview: React.FC<{ facts: MessageFacts | null; referenceDateIso: string }> = ({ facts, referenceDateIso }) => {
  const line = useCycle(statusLines(facts), 3600);
  // Seconds since the plan was asked for: the card grows with it.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 300);
    return () => window.clearInterval(id);
  }, []);
  const today = referenceDateIso.slice(0, 10);
  const end = facts?.startDate || facts?.approxDate;
  const span = end ? Math.max(1, (dayMs(end) - dayMs(today)) / DAY) : 0;
  const weeks = span ? Math.floor(span / 7) : 0;
  // Fills fast, then slows, never reaching the end before the plan does.
  const fill = Math.round(92 * (1 - Math.exp(-elapsed / 7)));
  const areas = (facts && AREAS[facts.category]) || DEFAULT_AREAS;
  const shownAreas = Math.min(areas.length, 1 + Math.floor(elapsed / 1.8));
  const rows = Math.min(7, 2 + Math.floor(elapsed / 1.6));
  return (
    <>
      <div className="flex justify-start aot-rise">
        <Avatar />
        <div className="max-w-[85%] bg-white border border-slate-200/90 text-slate-700 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-2xs text-xs sm:text-sm leading-relaxed">
          {reassurance(facts)}
        </div>
      </div>
      <div className="ml-9 bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs aot-rise" role="status" aria-live="polite">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your plan</p>
          <p className="text-sm font-black text-slate-900 leading-snug">{facts?.title || 'Your plan'}</p>
          {facts?.startDate ? (
            <p className="text-[11px] text-slate-500">
              {formatDisplayDate(facts.startDate)}
              {facts.endDate ? ` – ${formatDisplayDate(facts.endDate)}` : ''}
              {weeks > 0 ? ` · ${weeks} week${weeks === 1 ? '' : 's'} to go` : ''}
            </p>
          ) : facts?.relative ? (
            <p className="text-[11px] text-slate-500">{facts.relative.charAt(0).toUpperCase() + facts.relative.slice(1)}</p>
          ) : null}
        </div>
        {span > 0 && (
          <div className="relative h-9 mx-1" aria-hidden="true">
            <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-slate-200" />
            <div className="absolute left-0 top-2.5 h-1 rounded-full bg-[#95BFB5] transition-[width] duration-300 ease-linear" style={{ width: `${fill}%` }} />
            {/* Week marks for the next few months; month marks further out. */}
            {(weeks <= 16
              ? Array.from({ length: weeks }, (_, w) => ((w + 1) * 7) / span)
              : monthStarts(today, end!).map((iso) => (dayMs(iso) - dayMs(today)) / DAY / span)
            ).map((x, i) => (
              <div key={i} className="absolute top-1.5 w-px h-3 bg-slate-300" style={{ left: `${x * 100}%` }} />
            ))}
            <div className="absolute -right-1 top-1 w-4 h-4 rounded-full bg-[#182A42] border-[3px] border-white ring-1 ring-slate-300" />
            <span className="absolute left-0 top-5 text-[10px] font-mono text-slate-400">Today</span>
            <span className="absolute right-0 top-5 text-[10px] font-mono font-bold text-[#182A42]">{facts?.startDate ? shortDate(facts.startDate) : facts?.relative}</span>
          </div>
        )}
        <p className="text-xs font-bold text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#95BFB5] animate-pulse shrink-0" />
          <span key={line} className="aot-rise">{line}</span>
        </p>
        {/* What a plan like this covers, appearing one by one. */}
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {areas.slice(0, shownAreas).map((a) => (
            <span key={a} className="aot-rise text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
              {a}
            </span>
          ))}
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="grid grid-cols-[3rem_1fr] gap-2.5 items-start aot-rise">
              <Bar className="h-3 w-10 mt-0.5" />
              <div className="space-y-1.5">
                <Bar className={`h-3 ${['w-4/5', 'w-2/3', 'w-3/4', 'w-3/5', 'w-2/3', 'w-4/5', 'w-1/2'][i]}`} />
                <Bar className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        {elapsed > 14 && <p className="text-[11px] text-slate-400 aot-rise">Still on it. Plans with more to arrange take a little longer.</p>}
      </div>
    </>
  );
};

/** A change to a plan that's already there: one bubble with a moving line. */
export const UpdatingBubble: React.FC = () => {
  const line = useCycle(['Updating your plan…', 'Checking the dates again…', 'Almost there…'], 2200);
  return (
    <div className="flex justify-start">
      <Avatar />
      <div className="bg-white border border-slate-200/90 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-2xs flex items-center gap-2" role="status" aria-live="polite">
        <span className="w-2 h-2 rounded-full bg-[#95BFB5] animate-pulse shrink-0" />
        <span key={line} className="text-xs text-slate-500 font-semibold aot-rise">{line}</span>
      </div>
    </div>
  );
};

/** Examples for the try-out's first screen; each fills the box and sends. */
export const TRY_EXAMPLES = [
  { label: 'Hen weekend abroad', text: "My sister's hen weekend in Lisbon for 9 friends in 6 weeks" },
  { label: 'Moving house', text: 'Moving house across town with two kids in 7 weeks' },
  { label: "Kid's birthday party", text: "My son's 7th birthday party at home for 12 kids in 4 weeks" },
];

export const TRY_PLACEHOLDERS = ['Dinner party for 8 next Saturday…', 'Team offsite in March…', 'Our trip to Japan in May…', 'Mum’s 60th in two months…'];
