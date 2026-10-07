import React, { useEffect, useState } from 'react';
import { recordCalendarChoice } from './CalendarPreferencePoll';
import type { CalendarChoice } from '../utils/calendarPoll';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ShieldCheck, LayoutDashboard, ChevronRight, X } from 'lucide-react';
import { Logo } from './Logo';
import { trackButtonClick } from '../services/analytics';
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '../utils/usePageMeta';

/**
 * The landing comparison: what each calendar gets, accurate to how each
 * connects. Google syncs both ways directly (googleTasks.ts); Outlook and
 * Apple subscribe to the calendar link (server/calendarFeed.ts, refresh
 * asked hourly; Outlook takes its own time) and tick tasks off through
 * each task's Mark done link. Shared strengths first; what's still to come
 * last, small, never as a red cross.
 */
const CALENDAR_COLUMNS: Array<{ id: CalendarChoice; name: string; short: string }> = [
  { id: 'google', name: 'Google Calendar', short: 'Google' },
  { id: 'outlook', name: 'Outlook', short: 'Outlook' },
  { id: 'apple', name: 'Apple Calendar', short: 'Apple' },
];

const CALENDAR_ROWS: Array<{ label: string; later?: boolean; cells: Array<{ ok: boolean; note?: string }> }> = [
  { label: 'Your prep tasks appear in your calendar', cells: [{ ok: true }, { ok: true }, { ok: true }] },
  {
    label: 'Tick a task off in your calendar, and it\'s done here too',
    cells: [{ ok: true }, { ok: true, note: 'one tap' }, { ok: true, note: 'one tap' }],
  },
  {
    label: 'Done or changed here, updated in your calendar',
    cells: [{ ok: true, note: 'right away' }, { ok: true, note: 'within hours' }, { ok: true, note: 'about hourly' }],
  },
  { label: 'Plan by chat or Telegram, with daily updates', cells: [{ ok: true }, { ok: true }, { ok: true }] },
  {
    label: 'Finds events in your agenda to prepare for',
    later: true,
    cells: [{ ok: true }, { ok: false }, { ok: false }],
  },
];

interface LandingUSPPageProps {
  onGetStarted: () => void;
  onExploreDashboard: () => void;
  onGoToDashboard?: () => void;
  onOpenPrivacyPolicy: () => void;
}

export const LandingUSPPage: React.FC<LandingUSPPageProps> = ({
  onGetStarted,
  onExploreDashboard,
  onGoToDashboard,
  onOpenPrivacyPolicy,
}) => {
  // Explicit even though it matches the index.html default - keeps this
  // page's title/description correct if a user lands back on "/" after
  // usePageMeta reverted it from a page-specific value on another route.
  usePageMeta(DEFAULT_TITLE, DEFAULT_DESCRIPTION);

  // "Watch demo" opens the video in a player on top of the page. The player
  // (youtube-nocookie.com, allowed in vercel.json's CSP frame-src) only loads
  // once it's opened, so nothing from YouTube runs before the click.
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  useEffect(() => {
    if (!isDemoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsDemoOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDemoOpen]);
  const navigate = useNavigate();

  // Connect: straight into that calendar's setup. New visitors go through
  // onboarding with the calendar already chosen (step 2 shows its way to
  // connect); signed-in people go to the connection itself.
  const connectCalendar = (calendar: CalendarChoice) => {
    trackButtonClick(`Connect ${calendar}`, 'landing_calendar');
    recordCalendarChoice(calendar, 'landing');
    if (onGoToDashboard) {
      navigate(calendar === 'google' ? '/settings/connections' : `/setup/calendar?cal=${calendar}`);
      return;
    }
    navigate(`/onboarding?cal=${calendar}`);
  };

  return (
    <div className="relative z-10 min-h-screen w-full bg-[#182A42] flex flex-col justify-between font-sans text-slate-900 selection:bg-[#182A42] selection:text-white">

      {/* Top Header Navigation - white navbar, distinct from the navy page below it */}
      <div className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between p-4 sm:p-6 lg:px-10">
          <Logo variant="small" />

          <div className="flex items-center gap-3 sm:gap-4">
            {onGoToDashboard && (
              <button
                onClick={() => {
                  trackButtonClick('Go to Dashboard', 'landing_header');
                  onGoToDashboard();
                }}
                className="bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] border border-aot-sage-hover/50 font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                title="Return to your active events dashboard"
              >
                <LayoutDashboard className="w-4 h-4 text-[#182A42]" />
                <span>Go to Dashboard</span>
              </button>
            )}

            <a
              href="/how-it-works"
              onClick={(e) => {
                e.preventDefault();
                trackButtonClick('How it works', 'landing_header');
                navigate('/how-it-works');
              }}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 font-medium text-xs sm:text-sm px-3.5 py-2 rounded-xl transition-all cursor-pointer hidden md:flex items-center gap-1.5"
            >
              <span>How it works</span>
            </a>

            <a
              href="/features"
              onClick={(e) => {
                e.preventDefault();
                trackButtonClick('Features', 'landing_header');
                navigate('/features');
              }}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 font-medium text-xs sm:text-sm px-3.5 py-2 rounded-xl transition-all cursor-pointer hidden sm:flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-slate-500" />
              <span>Features</span>
            </a>

            <a
              href="/privacy"
              onClick={(e) => {
                trackButtonClick('Privacy Notice', 'landing_header');
                if (onOpenPrivacyPolicy) {
                  e.preventDefault();
                  onOpenPrivacyPolicy();
                }
              }}
              className="bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 font-medium text-xs sm:text-sm px-3.5 py-2 rounded-xl transition-all cursor-pointer hidden sm:flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <span>Privacy Notice</span>
            </a>

            {!onGoToDashboard && (
              <button
                onClick={() => {
                  trackButtonClick('Get Started For Free', 'landing_header');
                  onGetStarted();
                }}
                className="bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-bold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Get started for free</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hero Section featuring Big Logo */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 text-center space-y-6">
        
        {/* Hero logo lockup: brighter 3D mark, divider, and a wordmark with
            "Ahead" as the dominant word. The mark is a transparent-background
            cutout, so there is no backdrop box to hide or fade. */}
        <div className="flex items-center justify-center gap-4 sm:gap-7 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <img
            src="/assets/logo-hero.png"
            alt="Ahead Of Time logo: a calendar with a location pin above a road of stacked stripes"
            width={640}
            height={800}
            className="h-28 sm:h-44 w-auto shrink-0"
          />
          <div className="self-stretch w-px bg-white/70 my-3 sm:my-5" aria-hidden="true" />
          <div className="text-left">
            {/* Dark drop shadow matches the depth on the logo mark beside it. */}
            <p
              className="text-[1.7rem] min-[400px]:text-4xl sm:text-6xl leading-none tracking-tight text-white whitespace-nowrap"
              style={{ textShadow: '0 3px 6px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)' }}
            >
              <span className="font-black text-aot-sage">Ahead</span>{' '}
              <span className="font-semibold">Of Time</span>
            </p>
            <p className="mt-2 sm:mt-3 text-sm sm:text-xl font-medium text-white">
              Assistant for busy calendars
            </p>
          </div>
        </div>

        {/* Hero Headline / USP Statement - light text, now sitting directly on the navy page background */}
        <div className="space-y-3 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.2]">
            <span className="block">Calendars tell you when an event starts.</span>
            <span className="block">Ahead Of Time makes sure you are ready.</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-300 font-medium leading-relaxed">
            Drop an entry onto your calendar or plan with our assistant, and Ahead Of Time automatically builds backward preparation milestones. Whether you are organizing a birthday celebration, packing for a trip, or prepping a school theme day for your kids, we build in the breathing room.
          </p>
        </div>

        {/* Primary CTA Buttons */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
          {onGoToDashboard ? (
            <button
              onClick={() => {
                trackButtonClick('Open My Dashboard', 'landing_hero');
                onGoToDashboard();
              }}
              className="px-8 py-3.5 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] border border-aot-sage-hover/50 font-black text-sm sm:text-base shadow-lg shadow-slate-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4 text-[#182A42]" />
              <span>Open My Dashboard</span>
            </button>
          ) : (
            <button
              onClick={() => {
                trackButtonClick('Get Started For Free', 'landing_hero');
                onGetStarted();
              }}
              className="px-8 py-3.5 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-black text-sm sm:text-base shadow-lg shadow-slate-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>Get started for free</span>
            </button>
          )}
          <button
            onClick={() => {
              trackButtonClick('Watch Demo', 'landing_hero');
              setIsDemoOpen(true);
            }}
            className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-[#182A42] font-bold text-sm sm:text-base shadow-lg shadow-slate-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
            <span>Watch demo</span>
          </button>
        </div>
        {/* Try it out - quieter than the main buttons: plan one event
            without signing in (/try). */}
        {!onGoToDashboard && (
          <div className="-mt-1 text-center animate-in fade-in duration-700 delay-300">
            <a
              href="/try"
              onClick={() => trackButtonClick('Try it out', 'landing_hero')}
              className="inline-flex items-center gap-1 text-sm font-bold text-aot-sage hover:text-white underline underline-offset-4 decoration-aot-sage/50"
            >
              Or try it out first <ChevronRight className="w-3.5 h-3.5" />
            </a>
            <p className="mt-1 text-xs text-slate-400">No sign-in needed: plan one event and see how it works.</p>
          </div>
        )}
        {isDemoOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ahead Of Time demo video"
            onClick={() => setIsDemoOpen(false)}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl">
              <button
                type="button"
                onClick={() => setIsDemoOpen(false)}
                aria-label="Close video"
                className="absolute -top-11 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black">
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube-nocookie.com/embed/MgEA5t1td64?autoplay=1&rel=0"
                  title="Ahead Of Time demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* How the Assistant Works - the three core USPs */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 border-t border-white/10">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight">
            How Ahead Of Time works for you
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {/* Every image is pre-cropped to the same 3:2 frame with the subject
              centred at the same height, so image tops/bottoms line up across
              the three cards. */}
          {[
            {
              image: '/assets/usp-plan.jpg',
              alt: 'A calendar grid with a location pin marking the day that matters',
              title: 'Automates your backward planning',
              body: 'Describe what is coming in plain language, in the app or over Telegram, and get the full prep timeline worked out from the date backward.',
            },
            {
              image: '/assets/usp-progress.jpg',
              alt: 'Ahead Of Time overview showing tasks to finish this week, events coming up in the next 30 days, and a prompt to plan something new',
              title: 'Helps you track your progress',
              body: 'Tick tasks off as you go and see at a glance what is overdue, what is due this week, and how ready each event is.',
            },
            {
              image: '/assets/usp-calendar.jpg',
              alt: 'A calendar app icon',
              title: 'Works with your calendar',
              body: 'Google Calendar: scan your agenda and sync the tasks. Apple Calendar, Outlook and others: subscribe once and tick tasks off right from your calendar.',
            },
          ].map(({ image, alt, title, body }) => (
            <div
              key={title}
              className="bg-[#F2F7F5] border border-white/60 rounded-3xl p-4 sm:p-5 shadow-md shadow-slate-900/20 flex flex-col gap-4 hover:shadow-lg transition-all group"
            >
              <div className="aspect-[3/2] w-full overflow-hidden rounded-2xl bg-[#2b324e]">
                <img
                  src={image}
                  alt={alt}
                  width={900}
                  height={600}
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                />
              </div>
              <div className="space-y-2 px-1.5 pb-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug md:min-h-[3.25rem]">{title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* One side-by-side comparison: what works both ways on every
            calendar first, then - smaller - what's still to come for some. */}
        <div className="mt-8 max-w-4xl mx-auto">
          <h3 className="text-center text-lg sm:text-xl font-black text-white">Works with the calendar you already use</h3>
          <p className="mt-1 text-center text-xs sm:text-sm text-slate-300">Both ways: your tasks go into your calendar, and what you tick off there counts here.</p>
          <div className="mt-4 bg-[#22344a] border border-white/10 rounded-3xl p-3 sm:p-5 shadow-md shadow-slate-900/20 overflow-hidden">
            <div role="table" aria-label="What works with each calendar" className="text-xs sm:text-sm">
              <div role="row" className="grid grid-cols-[1.5fr_repeat(3,1fr)] gap-x-2 sm:gap-x-3 items-end pb-3 border-b border-white/10">
                <span role="columnheader" aria-label="Feature" />
                {CALENDAR_COLUMNS.map((c) => (
                  <span key={c.id} role="columnheader" className="text-center font-black text-white leading-tight">
                    <span className="hidden sm:inline">{c.name}</span>
                    <span className="sm:hidden">{c.short}</span>
                  </span>
                ))}
              </div>
              {CALENDAR_ROWS.map((row) => (
                <div
                  key={row.label}
                  role="row"
                  className={`grid grid-cols-[1.5fr_repeat(3,1fr)] gap-x-2 sm:gap-x-3 items-center border-b border-white/5 ${row.later ? 'py-2 text-slate-400' : 'py-2.5 text-slate-200'}`}
                >
                  <span role="rowheader" className={`leading-snug ${row.later ? 'text-[11px] sm:text-xs' : 'font-semibold'}`}>{row.label}</span>
                  {row.cells.map((cell, i) => (
                    <span key={i} role="cell" className="text-center leading-tight">
                      {cell.ok ? (
                        <span className="text-aot-sage font-black" aria-label="Yes">✓</span>
                      ) : (
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 bg-white/5 rounded-full px-2 py-0.5 inline-block">Coming later</span>
                      )}
                      {cell.note && <span className="block text-[10px] sm:text-[11px] text-slate-400 mt-0.5">{cell.note}</span>}
                    </span>
                  ))}
                </div>
              ))}
              <div role="row" className="grid grid-cols-[1.5fr_repeat(3,1fr)] gap-x-2 sm:gap-x-3 items-start pt-3">
                <span role="rowheader" className="text-[11px] text-slate-400 leading-snug pr-1">
                  No agenda scan yet? Just tell the assistant what's coming up - it plans it in seconds.
                </span>
                {CALENDAR_COLUMNS.map((c) => (
                  <span key={c.id} role="cell" className="flex flex-col items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => connectCalendar(c.id)}
                      className="w-full py-2 rounded-xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-black text-[11px] sm:text-sm cursor-pointer transition-colors"
                    >
                      Connect
                    </button>
                    <a
                      href={`/how-it-works?calendar=${c.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        trackButtonClick(`How it works ${c.name}`, 'landing_calendar');
                        navigate(`/how-it-works?calendar=${c.id}`);
                      }}
                      className="text-center text-[10px] sm:text-xs font-semibold text-slate-400 hover:text-white underline underline-offset-2"
                    >
                      How it works
                    </a>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            Something else?{' '}
            <button type="button" onClick={() => connectCalendar('other')} className="font-bold text-slate-200 hover:text-white underline underline-offset-2 cursor-pointer">
              Any calendar that can subscribe to a link works
            </button>
          </p>
        </div>
      </div>
      {/* Bottom Closing Banner - a lighter navy + border so it still reads as
          its own raised card now that the page behind it is navy too */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12 text-center space-y-6">
        <div className="bg-[#22344a] border border-white/10 text-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-900/30 space-y-6 relative overflow-hidden">
          <div className="space-y-3 relative z-10">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Try Ahead Of Time
            </h2>
            <p className="text-slate-300 text-sm sm:text-base font-semibold tracking-wide">
              Less scrambling. More headspace. Time to actually enjoy it.
            </p>
          </div>

          <div className="pt-2 relative z-10">
            <button
              onClick={() => {
                trackButtonClick('Get Started For Free', 'landing_footer_cta');
                onGetStarted();
              }}
              className="px-8 py-4 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-black text-base shadow-md hover:shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-[#182A42]" />
              <span>Get started for free</span>
            </button>
          </div>
        </div>

        {/* Footer info - light text, sitting directly on the navy page background */}
        <div className="text-xs text-slate-300 flex flex-wrap items-center justify-center gap-4 py-4">
          <a
            href="/privacy"
            onClick={(e) => {
              trackButtonClick('Privacy Policy Link', 'landing_footer');
              if (onOpenPrivacyPolicy) {
                e.preventDefault();
                onOpenPrivacyPolicy();
              }
            }}
            className="hover:text-white underline cursor-pointer"
          >
            Privacy Policy
          </a>
          <span>&bull;</span>
          <span>Secure Calendar Integration</span>
        </div>
      </div>

    </div>
  );
};
