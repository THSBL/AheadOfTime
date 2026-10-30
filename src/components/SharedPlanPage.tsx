import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { ArrowRight, CalendarPlus, Check, ChevronDown, Loader2, RefreshCw, X } from 'lucide-react';
import { Logo } from './Logo';
import { AdSlot } from './AdSlot';
import { FollowHelp, type CalendarApp } from './FollowHelp';
import { formatDisplayDate } from '../utils/tminusRules';
import { usePageMeta } from '../utils/usePageMeta';
import { trackButtonClick, trackEvent } from '../services/analytics';
import {
  googleAddLink,
  googleSubscribeLink,
  nextUpStep,
  outlookAddLink,
  outlookSubscribeLink,
  shortDay,
  upcomingSteps,
  webcalUrl,
  type CalendarItem,
  type FixedMoment,
} from '../utils/planLink';

/**
 * /p/:token - a plan someone shared (server/sharedPlans.ts). Guests see the
 * day and what's asked of them, with the next step up front, and FOLLOW the
 * plan in their own calendar: a subscription that changes when the owner
 * changes the plan (Google, Apple, Outlook), with a short "don't see it?"
 * for the app they use. Adding the dates once is still there as a fallback.
 * Guests tick their own steps off here, remembered on their device - the
 * owner's ticks are never theirs (the server leaves them out). Below it, an
 * invitation to plan your own (the try-out, no sign-in) and one ad block.
 * Not indexed by search engines.
 */

interface Step {
  id?: string;
  title: string;
  date: string;
  ideas: string[];
  done: boolean;
}

interface Snapshot {
  title: string;
  eventDate: string;
  endDate?: string;
  eventTime?: string;
  steps: Step[];
  fixed?: FixedMoment[];
  audience?: 'guests' | 'all';
}

function guessApp(): CalendarApp {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|Macintosh/.test(ua)) return 'apple';
  return 'google';
}

const stepKey = (s: Step) => s.id || `${s.title}|${s.date}`;

/** The guest's own ticks, on this device only. */
function useOwnTicks(token: string) {
  const storeKey = `aot_guest_done_${token}`;
  const [ticked, setTicked] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const toggle = (key: string) =>
    setTicked((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        // Storage blocked: ticks last for this visit.
      }
      return next;
    });
  return { ticked, toggle };
}

function AddToCalendarSheet({ title, items, feedUrl, onClose }: { title: string; items: CalendarItem[]; feedUrl: string | null; onClose: () => void }) {
  const [app, setApp] = useState<CalendarApp>(guessApp);
  const [followed, setFollowed] = useState<CalendarApp | null>(null);
  const [showOnce, setShowOnce] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: Array<{ id: CalendarApp; label: string }> = [
    { id: 'google', label: 'Google' },
    { id: 'apple', label: 'Apple' },
    { id: 'outlook', label: 'Outlook' },
  ];
  const followHref = feedUrl
    ? app === 'google'
      ? googleSubscribeLink(feedUrl)
      : app === 'apple'
        ? webcalUrl(feedUrl)
        : outlookSubscribeLink(feedUrl, title)
    : null;
  const appName = app === 'google' ? 'Google Calendar' : app === 'apple' ? 'Apple Calendar' : 'Outlook';

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-add-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 text-slate-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="guest-add-title" className="text-lg font-black text-[#182A42]">Add to my calendar</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div role="group" aria-label="Your calendar" className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={app === t.id}
              onClick={() => {
                setApp(t.id);
                setFollowed(null);
              }}
              className={`min-h-10 rounded-lg text-xs cursor-pointer ${app === t.id ? 'bg-[#182A42] text-white font-extrabold' : 'text-slate-700 font-bold hover:bg-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {followHref ? (
            <a
              href={followHref}
              target={app === 'apple' ? undefined : '_blank'}
              rel="noreferrer"
              onClick={() => {
                setFollowed(app);
                trackEvent('guest_follow_plan', { app });
              }}
              className="flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black"
            >
              <RefreshCw className="w-4 h-4" /> Follow this plan in {appName}
            </a>
          ) : (
            <p className="text-xs text-slate-600">Following isn't available for this plan right now; add the dates below.</p>
          )}
          <p className="text-xs text-slate-600 text-center">
            All {items.length} {items.length === 1 ? 'date' : 'dates'}, and it updates by itself when the plan changes.
          </p>
        </div>

        {followed === app && <FollowHelp app={app} title={title} />}

        {app !== 'apple' && (
          <div className="border-t border-slate-200 pt-3">
            <button
              type="button"
              aria-expanded={showOnce}
              onClick={() => setShowOnce((v) => !v)}
              className="w-full min-h-10 flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer"
            >
              Or add the dates once (they won't update)
              <ChevronDown className={`w-4 h-4 transition-transform ${showOnce ? 'rotate-180' : ''}`} />
            </button>
            {showOnce && (
              <ul className="mt-2 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200">
                {items.map((item) => {
                  const key = `${app}:${item.title}:${item.date}`;
                  return (
                    <li key={key} className="flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5">
                      <span className="text-[13px] min-w-0">
                        <b className="block truncate">{item.title}</b>
                        <span className="text-[11px] text-slate-500">{shortDay(item.date)}{item.time ? ` · ${item.time}` : ''}</span>
                      </span>
                      {added[key] ? (
                        <span className="shrink-0 min-h-10 min-w-16 rounded-xl bg-aot-green-100 text-aot-green-800 text-xs font-extrabold inline-flex items-center justify-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Added
                        </span>
                      ) : (
                        <a
                          href={app === 'google' ? googleAddLink(item) : outlookAddLink(item)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            setAdded((prev) => ({ ...prev, [key]: true }));
                            trackEvent('guest_add_calendar', { app });
                          }}
                          className="shrink-0 min-h-10 min-w-16 rounded-xl bg-[#182A42] text-white text-xs font-extrabold inline-flex items-center justify-center"
                        >
                          Add
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-500 text-center">No account and nothing to download. In your calendar the dates are read-only: tick your steps off on this page.</p>
      </div>
    </div>,
    document.body
  );
}

export const SharedPlanPage: React.FC = () => {
  const { token = '' } = useParams();
  const [plan, setPlan] = useState<Snapshot | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone'>('loading');
  const [adding, setAdding] = useState(false);
  const { ticked, toggle } = useOwnTicks(token);

  usePageMeta(plan ? `${plan.title} - shared plan - Ahead Of Time` : 'Shared plan - Ahead Of Time');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan/shared?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && data?.ok && data.plan) {
          setPlan(data.plan);
          setFeedUrl(data.feedUrl || null);
          setState('ok');
          trackEvent('shared_plan_view');
        } else setState('gone');
      })
      .catch(() => !cancelled && setState('gone'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const today = new Date().toISOString().slice(0, 10);
  const moments: FixedMoment[] = useMemo(
    () => (plan ? plan.fixed?.length ? plan.fixed : [{ key: 'event', title: plan.title, date: plan.eventDate, endDate: plan.endDate, time: plan.eventTime }] : []),
    [plan]
  );
  // Done for this guest: their own tick (or, for a co-organiser, the plan's).
  const steps = useMemo(() => (plan ? plan.steps.map((s) => ({ ...s, done: s.done || ticked.includes(stepKey(s)) })) : []), [plan, ticked]);
  const next = nextUpStep(steps, today);
  const calendarItems: CalendarItem[] = useMemo(() => {
    if (!plan) return [];
    const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
    const fixed = moments.map((m) => ({ title: m.title, date: m.date, endDate: m.endDate, time: m.time, minutes: m.key === 'event' ? 120 : 60, details: `The plan: ${pageUrl}` }));
    const open = upcomingSteps<Step>(plan.steps, today).map((s) => ({ title: `${s.title} · ${plan.title}`, date: s.date, details: [...s.ideas, `The plan: ${pageUrl}`].join('\n') }));
    return [...open, ...fixed].sort((a, b) => a.date.localeCompare(b.date));
  }, [plan, moments, today]);
  const isGuestView = plan?.audience === 'guests';

  return (
    <div className="min-h-screen w-full bg-[#f1f7fe] flex flex-col p-4 sm:p-6 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto w-full flex items-center justify-between py-2">
        <a href="/" aria-label="Ahead Of Time home">
          <Logo variant="small" />
        </a>
        <a href="/try" className="text-xs font-bold text-[#182A42] hover:underline">Plan your own</a>
      </div>

      <main className="max-w-2xl mx-auto w-full mt-4 sm:mt-8 space-y-4 pb-10">
        {state === 'loading' && (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading the plan…</p>
        )}

        {state === 'gone' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <h1 className="text-lg font-black text-[#182A42]">This shared plan isn't available</h1>
            <p className="text-sm text-slate-600">The person who shared it may have stopped sharing. You can still plan your own, free.</p>
          </section>
        )}

        {state === 'ok' && plan && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-[#447463]">{isGuestView ? "You're invited" : 'Shared plan'}</p>
              <h1 className="mt-1 text-xl sm:text-2xl font-black text-[#182A42] leading-tight">{plan.title}</h1>
              <p className="text-sm text-slate-600 mt-0.5">
                {formatDisplayDate(plan.eventDate)}
                {plan.endDate ? ` – ${formatDisplayDate(plan.endDate)}` : ''}
                {plan.eventTime ? ` · ${plan.eventTime}` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAdding(true);
                trackButtonClick('Add to my calendar', 'shared_plan');
              }}
              className="w-full min-h-12 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" /> Add to my calendar
            </button>

            {steps.length > 0 && (
              <div>
                <h2 className="text-[13px] font-black mb-1">{isGuestView ? "What's asked of you" : 'The plan'}</h2>
                <p className="text-[11px] text-slate-500 mb-3">Tick off what you've done. Only you see your ticks, on this phone.</p>
                <ol className="relative border-l-2 border-slate-200 ml-1.5 space-y-4">
                  {steps.map((s, i) => {
                    const isNext = next === s;
                    const own = ticked.includes(stepKey(s));
                    return (
                      <li key={`${s.date}-${i}`} className="pl-4 relative">
                        <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${s.done ? 'bg-[#447463]' : 'bg-aot-sage'}`} />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                              {formatDisplayDate(s.date)}
                              {isNext && <span className="normal-case tracking-normal text-[10px] font-black text-aot-green-800 bg-aot-green-100 px-2 py-0.5 rounded-full">Next up</span>}
                            </p>
                            <p className={`text-sm font-bold leading-snug ${s.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{s.title}</p>
                            {s.ideas.length > 0 && !s.done && (
                              <ul className="mt-1 space-y-0.5">
                                {s.ideas.map((idea) => (
                                  <li key={idea} className="text-xs text-slate-500 leading-snug pl-3 relative before:content-['›'] before:absolute before:left-0.5 before:text-[#447463]">
                                    {idea}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {/* A co-organiser's view shows the plan's own ticks; those aren't the viewer's to undo. */}
                          {(isGuestView || !plan.steps[i].done) && (
                            <button
                              type="button"
                              aria-pressed={own}
                              aria-label={`${s.title}: ${own ? 'done' : 'not done yet'}`}
                              onClick={() => {
                                toggle(stepKey(s));
                                trackEvent('guest_tick_step', { done: !own });
                              }}
                              className={`shrink-0 w-11 h-11 rounded-xl border-2 flex items-center justify-center cursor-pointer ${
                                own ? 'bg-[#447463] border-[#447463] text-white' : 'border-slate-300 text-transparent hover:border-[#447463]'
                              }`}
                            >
                              <Check className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {moments.map((m) => (
                    <li key={m.key} className="pl-4 relative">
                      <span className="absolute -left-[8px] top-1 w-3.5 h-3.5 rounded-full bg-[#182A42] border-2 border-white" />
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{formatDisplayDate(m.date)}{m.time ? ` · ${m.time}` : ''}</p>
                      <p className="text-sm font-black text-[#182A42]">{m.key === 'event' ? 'The day itself' : m.title}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p className="text-[11px] text-slate-500">This page always shows the latest plan.</p>
          </section>
        )}

        {state !== 'loading' && (
          <section className="rounded-2xl bg-[#182A42] text-white p-5 space-y-2">
            <p className="text-base font-black">Planning something yourself?</p>
            <p className="text-sm text-slate-300">
              Describe it in your own words and get the prep worked back from the date, with ideas for every step. Free, no sign-in.
            </p>
            <a
              href="/try"
              onClick={() => trackButtonClick('Plan your own', 'shared_plan')}
              className="inline-flex items-center gap-2 mt-1 px-4 py-2.5 rounded-xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black"
            >
              Plan your own <ArrowRight className="w-4 h-4" />
            </a>
          </section>
        )}

        {state === 'ok' && <AdSlot place="sharedPlan" className="pt-2" />}
      </main>

      {adding && plan && <AddToCalendarSheet title={plan.title} items={calendarItems} feedUrl={feedUrl} onClose={() => setAdding(false)} />}
    </div>
  );
};
