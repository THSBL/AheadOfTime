import React, { useState } from 'react';
import { Sparkles, ShieldCheck, LayoutDashboard, ChevronRight } from 'lucide-react';
import { Logo } from './Logo';
import { trackButtonClick } from '../services/analytics';
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '../utils/usePageMeta';

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

  // The demo video is still being produced - the button exists so the layout
  // is final, and says so instead of opening a browser alert() or a dead link.
  const [showDemoNotice, setShowDemoNotice] = useState(false);

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
            <span className="block">Ahead of time makes sure you are ready.</span>
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
          {/* Placeholder until the demo video exists (see showDemoNotice). */}
          <button
            onClick={() => {
              trackButtonClick('Watch Demo', 'landing_hero');
              setShowDemoNotice(true);
            }}
            className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-[#182A42] font-bold text-sm sm:text-base shadow-lg shadow-slate-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
            <span>Watch demo</span>
          </button>
        </div>
        {showDemoNotice && (
          <p role="status" className="text-xs sm:text-sm text-slate-300 animate-in fade-in duration-300">
            The demo video is coming soon.
          </p>
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
              alt: 'Google Calendar',
              title: 'Syncs with Google Calendar',
              body: 'Link your calendar and every event that needs prep gets its own countdown of milestones, without cluttering the events themselves.',
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
