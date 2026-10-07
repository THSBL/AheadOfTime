import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { Logo } from './Logo';
import type { CalendarEvent } from '../types';
import { formatDisplayDate } from '../utils/tminusRules';
import { readAiRefusal } from '../services/aiRequest';
import { adoptTrialPlan, getCurrentUser, saveTrialPlan } from '../services/accountManager';
import { openSignIn } from './SignInModal';
import { trackButtonClick, trackEvent } from '../services/analytics';

/**
 * /try - plan one event without signing in. The visitor sees exactly how a
 * plan is built, says how happy they are with it, and only then is asked
 * to sign in to put it in their calendar. Nothing is stored on our side
 * until they do: the plan waits on this device (saveTrialPlan) and joins
 * their account at sign-in (adoptTrialPlan). The server allows a few
 * try-out plans per visitor (TRIAL_LIMITS in server/aiGuard.ts).
 */

const EXAMPLES = [
  "Dinner for Mum's 60th birthday on 14 November",
  'Long weekend in Lisbon with Sam, 5-8 December',
  'School theme day for my daughter next Friday',
  'Team offsite for 12 people in March',
];

type Rating = 'love' | 'good' | 'meh' | 'bad';
const RATINGS: Array<{ id: Rating; face: string; label: string }> = [
  { id: 'love', face: '😍', label: 'Love it' },
  { id: 'good', face: '🙂', label: 'Good' },
  { id: 'meh', face: '😐', label: 'So-so' },
  { id: 'bad', face: '😞', label: 'Not right' },
];

const trialHeaders = { 'Content-Type': 'application/json', 'x-aot-trial': '1' };

export const TryPage: React.FC = () => {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [change, setChange] = useState('');
  const [choosingCalendar, setChoosingCalendar] = useState(false);

  useEffect(() => {
    trackEvent('trial_open');
  }, []);

  // Signed in from this page (Google or the email link opened here): the
  // plan has joined the account - open it with the push-to-Google window.
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const user = (e as CustomEvent<{ user: { id: string; provider?: string } | null }>).detail?.user;
      if (!user || !event) return;
      navigate(`/events/${encodeURIComponent(event.id)}${user.provider === 'google' ? '?sync=pending' : ''}`);
    };
    window.addEventListener('aot_account_switched', onSwitch);
    return () => window.removeEventListener('aot_account_switched', onSwitch);
  }, [event, navigate]);

  const plan = async (message: string, current: CalendarEvent | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/process', {
        method: 'POST',
        headers: trialHeaders,
        body: JSON.stringify(
          current
            ? { message, currentReferenceDate: new Date().toISOString(), activeEvents: [current], targetEventId: current.id, lockToTargetEvent: true }
            : { message, currentReferenceDate: new Date().toISOString(), activeEvents: [] }
        ),
      });
      const refusal = await readAiRefusal(res);
      if (refusal) throw new Error(refusal);
      if (!res.ok) throw new Error('Planning didn\'t work just now. Try again in a moment.');
      const data = await res.json();
      const next: CalendarEvent = data.event;
      if (!next?.id) throw new Error('Planning didn\'t work just now. Try again in a moment.');
      setEvent(next);
      setReply(data.focusText || data.replyText || null);
      setRating(null);
      setChange('');
      setChoosingCalendar(false);
      saveTrialPlan(next);
      trackEvent(current ? 'trial_refine' : 'trial_plan', { category: next.category, steps: (next.milestones || []).length });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const steps = useMemo(
    () =>
      (event?.milestones || [])
        .filter((m) => m.isActive !== false && m.status !== 'skipped')
        .sort((a, b) => (a.calculatedDate || '').localeCompare(b.calculatedDate || '')),
    [event]
  );

  const rate = (r: Rating) => {
    setRating(r);
    trackEvent('trial_rating', { rating: r });
  };

  const pushToCalendar = () => {
    trackButtonClick('Push to my calendar', 'trial');
    const user = getCurrentUser();
    if (user?.id && event) {
      // Already signed in: add it to their plans right away.
      adoptTrialPlan(user.id);
      navigate(`/events/${encodeURIComponent(event.id)}${user.provider === 'google' ? '?sync=pending' : ''}`);
      return;
    }
    setChoosingCalendar(true);
  };

  const happy = rating === 'love' || rating === 'good';

  return (
    <div className="min-h-screen w-full bg-[#f1f7fe] flex flex-col p-4 sm:p-6 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto w-full flex items-center justify-between py-2">
        <button type="button" onClick={() => navigate('/')} className="cursor-pointer" aria-label="Ahead Of Time home">
          <Logo variant="small" />
        </button>
        <button type="button" onClick={() => openSignIn()} className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
          Sign in
        </button>
      </div>

      <main className="max-w-2xl mx-auto w-full mt-4 sm:mt-8 space-y-4 pb-10">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-[#447463]">Try it out · no sign-in needed</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[#182A42] tracking-tight">What's coming up?</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Describe an event, trip or deadline in your own words. Ahead Of Time builds the prep plan backwards from the date, so you see what to do
            and when. Nothing is saved until you choose to put it in your calendar.
          </p>
        </div>

        {!event && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) void plan(input.trim(), null);
              }}
              className="space-y-3"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="e.g. Dinner for Mum's 60th birthday on 14 November, about 12 people"
                aria-label="Describe what's coming up"
                className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#182A42] resize-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setInput(ex)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-aot-sage" />}
                {busy ? 'Building your plan…' : 'Build my plan'}
              </button>
            </form>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              What you type is sent to Google's Gemini API to write the plan. See our{' '}
              <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>.
            </p>
          </section>
        )}

        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

        {event && (
          <>
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Your plan</p>
              <h2 className="mt-1 text-lg sm:text-xl font-black text-[#182A42] leading-tight">{event.title}</h2>
              <p className="text-sm text-slate-600 mt-0.5">
                {formatDisplayDate(event.eventDate)}
                {event.endDate && event.endDate !== event.eventDate ? ` – ${formatDisplayDate(event.endDate)}` : ''}
                {event.eventTime ? ` · ${event.eventTime}` : ''}
              </p>
              {reply && <p className="mt-3 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{reply}</p>}

              <ol className="mt-4 relative border-l-2 border-slate-200 ml-1.5 space-y-3">
                {steps.map((m) => (
                  <li key={m.id} className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-aot-sage border-2 border-white" />
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{formatDisplayDate(m.calculatedDate)}</p>
                    <p className="text-sm font-bold text-slate-900 leading-snug">{m.title}</p>
                    {m.description && <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{m.description}</p>}
                  </li>
                ))}
                <li className="pl-4 relative">
                  <span className="absolute -left-[8px] top-1 w-3.5 h-3.5 rounded-full bg-[#182A42] border-2 border-white" />
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{formatDisplayDate(event.eventDate)}</p>
                  <p className="text-sm font-black text-[#182A42]">The day itself</p>
                </li>
              </ol>
            </section>

            {/* How happy are you with it? */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
              <p className="text-sm font-extrabold text-[#182A42]">How happy are you with this plan?</p>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Rate this plan">
                {RATINGS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => rate(r.id)}
                    aria-pressed={rating === r.id}
                    className={`py-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                      rating === r.id ? 'border-[#182A42] bg-[#182A42]/5 ring-1 ring-[#182A42]' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-2xl leading-none" aria-hidden="true">{r.face}</span>
                    <span className="block text-[11px] font-bold text-slate-600 mt-1">{r.label}</span>
                  </button>
                ))}
              </div>

              {rating && !happy && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (change.trim()) {
                      trackEvent('trial_change_requested', { rating });
                      void plan(change.trim(), event);
                    }
                  }}
                  className="space-y-2 pt-1"
                >
                  <label htmlFor="trial-change" className="text-xs font-bold text-slate-600">What should be different? We'll adjust the plan.</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="trial-change"
                      value={change}
                      onChange={(e) => setChange(e.target.value)}
                      maxLength={400}
                      placeholder="e.g. It's at a restaurant, not at home - and no gift needed"
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#182A42]"
                    />
                    <button
                      type="submit"
                      disabled={busy || !change.trim()}
                      className="px-4 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      Adjust the plan
                    </button>
                  </div>
                </form>
              )}

              {happy && !choosingCalendar && (
                <div className="pt-1 space-y-2">
                  <button
                    type="button"
                    onClick={pushToCalendar}
                    className="w-full py-3.5 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-black text-sm shadow-md inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CalendarCheck className="w-4 h-4" /> Push to my calendar
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">Free. Sign in once and every step lands in your calendar, with a reminder when it's due.</p>
                </div>
              )}

              {happy && choosingCalendar && (
                <div className="pt-1 space-y-2">
                  <p className="text-xs font-bold text-slate-600">Which calendar do you use?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openSignIn('Continue with Google to put this plan in your Google Calendar. Your plan comes with you.')}
                      className="py-3 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold cursor-pointer"
                    >
                      Google Calendar
                    </button>
                    {(['outlook', 'apple', 'other'] as const).map((cal) => (
                      <button
                        key={cal}
                        type="button"
                        onClick={() => navigate(`/setup/calendar?cal=${cal}`)}
                        className="py-3 rounded-xl border border-[#182A42] text-[#182A42] hover:bg-slate-50 text-sm font-bold cursor-pointer"
                      >
                        {cal === 'outlook' ? 'Outlook' : cal === 'apple' ? 'Apple Calendar' : 'Something else'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Your plan comes with you when you sign in. By signing in you agree to our{' '}
                    <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>.
                  </p>
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setEvent(null);
                  setReply(null);
                  setRating(null);
                  setInput('');
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Plan something else
              </button>
              <button type="button" onClick={() => navigate('/onboarding')} className="text-xs font-bold text-[#182A42] inline-flex items-center gap-1 cursor-pointer">
                Get started for free <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
