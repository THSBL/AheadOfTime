import React from 'react';
import { Sparkles, ArrowRight, Calendar, CheckCircle2, MessageSquare, ShieldCheck, Clock, Play, LayoutDashboard } from 'lucide-react';
import { Logo } from './Logo';
import { trackButtonClick } from '../services/analytics';

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
                className="bg-gradient-to-r from-[#62a98c] via-[#529479] to-[#3f7962] hover:from-[#579b7f] hover:via-[#48876c] hover:to-[#376c56] text-white border border-[#3f7962]/50 font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                title="Return to your active events dashboard"
              >
                <LayoutDashboard className="w-4 h-4 text-white" />
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
                className="bg-[#182A42] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Get Started For Free</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hero Section featuring Big Logo */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 text-center space-y-6">
        
        {/* Big Logo Featured Prominently - very light sage tint instead of stark white */}
        <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="bg-[#F2F7F5] border border-white/60 p-5 sm:p-7 md:p-8 rounded-2xl inline-flex flex-col items-center shadow-lg shadow-slate-900/10">
            <Logo variant="large" size="xl" />
          </div>
        </div>

        {/* Hero Headline / USP Statement - light text, now sitting directly on the navy page background */}
        <div className="space-y-3 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.2]">
            Calendars tell you when an event starts. Ahead Of Time makes sure you are ready when it does.
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
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#62a98c] via-[#529479] to-[#3f7962] hover:from-[#579b7f] hover:via-[#48876c] hover:to-[#376c56] text-white border border-[#3f7962]/50 font-black text-sm sm:text-base shadow-lg shadow-slate-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4 text-white" />
              <span>Open My Dashboard</span>
            </button>
          ) : (
            <button
              onClick={() => {
                trackButtonClick('Get Started For Free', 'landing_hero');
                onGetStarted();
              }}
              className="px-8 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-[#182A42] font-black text-sm sm:text-base shadow-lg shadow-slate-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>Get Started For Free</span>
            </button>
          )}

          <button
            onClick={() => {
              trackButtonClick('Watch Demo Video', 'landing_hero');
              alert("Watch Demo Video: Ahead Of Time workflow walkthrough.");
            }}
            className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm border border-slate-200 shadow-sm transition-all cursor-pointer flex items-center gap-2"
          >
            <Play className="w-4 h-4 text-[#447463] fill-[#447463]" />
            <span>Watch Demo Video</span>
          </button>
        </div>

      </div>

      {/* How the Assistant Works - Two Elements */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 border-t border-white/10">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight">
            How Ahead Of Time works for you
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            The assistant can work in multiple ways:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">

          {/* Element 1 */}
          <div className="bg-[#F2F7F5] border border-white/60 rounded-3xl p-6 sm:p-8 shadow-md shadow-slate-900/20 flex flex-col justify-between space-y-4 hover:shadow-lg transition-all group">
            <div className="space-y-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-800 group-hover:scale-110 transition-transform shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">Automatic Calendar Sync</h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                Link your calendar, and the assistant determines which events need extra preparation.
              </p>
            </div>
          </div>

          {/* Element 2 */}
          <div className="bg-[#F2F7F5] border border-white/60 rounded-3xl p-6 sm:p-8 shadow-md shadow-slate-900/20 flex flex-col justify-between space-y-4 hover:shadow-lg transition-all group">
            <div className="space-y-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 group-hover:scale-110 transition-transform shrink-0">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">Interactive Assistant &amp; Planner</h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                Use the assistant to add a new event or refine your existing events.
              </p>
            </div>
          </div>

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
              className="px-8 py-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-base shadow-md hover:shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-[#447463]" />
              <span>Get Started For Free</span>
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
