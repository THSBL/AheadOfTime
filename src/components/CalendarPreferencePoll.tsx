import React, { useState } from 'react';
import { Check, Loader2, CalendarDays } from 'lucide-react';
import {
  CALENDAR_CHOICES,
  CALENDAR_CHOICE_LABELS,
  CalendarChoice,
  CalendarPollSource,
} from '../utils/calendarPoll';
import { getStoredAccessToken } from '../services/googleAuth';
import { trackEvent } from '../services/analytics';

// Random, anonymous per-browser id so one visitor counts once per place
// (the server keeps one row per visitor and source). Storage can be blocked
// (private mode) - then it falls back to an id for this page view only.
function getVisitorId(): string {
  const fresh = () => (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  try {
    const existing = localStorage.getItem('aot_visitor_id');
    if (existing) return existing;
    const id = fresh();
    localStorage.setItem('aot_visitor_id', id);
    return id;
  } catch {
    return fresh();
  }
}

function readSavedAnswer(source: CalendarPollSource): CalendarChoice | null {
  try {
    const saved = localStorage.getItem(`aot_calendar_poll_${source}`);
    return saved && (CALENDAR_CHOICES as readonly string[]).includes(saved) ? (saved as CalendarChoice) : null;
  } catch {
    return null;
  }
}

interface CalendarPreferencePollProps {
  source: CalendarPollSource;
  /** 'dark' sits on the navy landing page; 'light' inside white cards. */
  variant?: 'dark' | 'light';
  question?: string;
  intro?: string;
  /** Offer "email me when it's supported" for calendars we don't support yet. */
  offerNotifyEmail?: boolean;
  onAnswered?: (calendar: CalendarChoice) => void;
  /** Small uppercase label, matching form fields such as onboarding's. */
  formLabel?: boolean;
}

/**
 * "Which calendar do you use?" - measures demand for calendars beyond
 * Google (see docs/outlook-integration-plan.md). Saves on its own through
 * the anonymous /api/feedback/calendar-poll endpoint; never blocks the page
 * it sits on.
 */
export const CalendarPreferencePoll: React.FC<CalendarPreferencePollProps> = ({
  source,
  variant = 'light',
  question = 'Which calendar do you use?',
  intro,
  offerNotifyEmail = false,
  onAnswered,
  formLabel = false,
}) => {
  const [answer, setAnswer] = useState<CalendarChoice | null>(() => readSavedAnswer(source));
  const [pending, setPending] = useState<CalendarChoice | null>(null);
  const [otherText, setOtherText] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);

  const dark = variant === 'dark';

  const save = async (calendar: CalendarChoice, extras: { otherText?: string; notifyEmail?: string } = {}) => {
    setIsSaving(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const res = await fetch('/api/feedback/calendar-poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ calendar, source, visitorId: getVisitorId(), ...extras }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not save your answer.');
      setAnswer(calendar);
      if (extras.notifyEmail) setEmailSaved(true);
      try {
        localStorage.setItem(`aot_calendar_poll_${source}`, calendar);
      } catch {
        // Only affects showing "thanks" on a later visit.
      }
      trackEvent('calendar_poll_answer', { source, calendar, left_email: Boolean(extras.notifyEmail) });
      onAnswered?.(calendar);
    } catch (err: any) {
      setError(err?.message || 'Could not save your answer.');
    } finally {
      setIsSaving(false);
    }
  };

  const choose = (calendar: CalendarChoice) => {
    if (isSaving) return;
    setAnswer(null);
    setEmailSaved(false);
    // Google: nothing more to ask. Others: one optional follow-up first.
    if (calendar === 'google') {
      setPending(null);
      save('google');
    } else {
      setPending(calendar);
    }
  };

  const chip = (selected: boolean) =>
    `text-xs font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${
      selected
        ? dark
          ? 'bg-aot-sage text-[#182A42] border-aot-sage'
          : 'bg-[#182A42] text-white border-[#182A42]'
        : dark
          ? 'bg-white/5 text-white border-white/25 hover:bg-white/10'
          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
    }`;
  const input = `w-full sm:flex-1 min-w-0 text-xs px-3 py-2 rounded-xl border focus:outline-none ${
    dark
      ? 'bg-white/10 text-white placeholder:text-slate-400 border-white/20 focus:border-white/50'
      : 'bg-slate-50 text-slate-900 border-slate-200 focus:border-slate-400'
  }`;
  const button = `shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${
    dark ? 'bg-aot-sage hover:bg-aot-sage-hover text-[#182A42]' : 'bg-[#182A42] hover:bg-slate-800 text-white'
  }`;
  const muted = dark ? 'text-slate-300' : 'text-slate-500';
  const selected = pending || answer;

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <p className={formLabel
          ? 'text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5'
          : `text-sm font-bold ${dark ? 'text-white' : 'text-slate-800'}`}
        >
          {formLabel && <CalendarDays className="w-3.5 h-3.5 text-sky-700" />}
          <span>{question}</span>
        </p>
        {intro && <p className={`text-xs leading-relaxed ${muted}`}>{intro}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={question}>
        {CALENDAR_CHOICES.map((calendar) => (
          <button
            key={calendar}
            type="button"
            onClick={() => choose(calendar)}
            disabled={isSaving}
            aria-pressed={selected === calendar}
            className={chip(selected === calendar)}
          >
            {CALENDAR_CHOICE_LABELS[calendar]}
          </button>
        ))}
      </div>

      {pending && !answer && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(pending, { otherText: pending === 'other' ? otherText : undefined, notifyEmail: offerNotifyEmail ? notifyEmail : undefined });
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          {pending === 'other' && (
            <input
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Which one? (optional)"
              maxLength={80}
              className={input}
            />
          )}
          {offerNotifyEmail && (
            <input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder={`Email me when ${pending === 'other' ? 'it' : CALENDAR_CHOICE_LABELS[pending]} is supported (optional)`}
              className={input}
            />
          )}
          <button type="submit" disabled={isSaving} className={button}>
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send'}
          </button>
        </form>
      )}

      {isSaving && !pending && (
        <p className={`text-xs flex items-center gap-1.5 ${muted}`}>
          <Loader2 className="w-3 h-3 animate-spin" /> Saving…
        </p>
      )}

      {answer && !isSaving && (
        <p className={`text-xs flex items-center gap-1.5 ${muted}`}>
          <Check className={`w-3.5 h-3.5 ${dark ? 'text-aot-sage' : 'text-emerald-600'}`} />
          {answer === 'google'
            ? 'Thanks! Google Calendar sync is ready for you.'
            : emailSaved
              ? "Thanks! We'll email you when it's supported."
              : 'Thanks - this helps us decide which calendar to support next.'}
        </p>
      )}

      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
    </div>
  );
};
