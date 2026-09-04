import React from 'react';
import { Sparkles, ArrowRight, Calendar, CheckCircle2, MessageSquare, ShieldCheck, Clock, Play, LayoutDashboard } from 'lucide-react';
import { Logo } from './Logo';

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
    <div className="relative z-10 min-h-screen w-full bg-gradient-to-b from-[#f1f7fe] via-[#e5f1fc] to-[#d6ebfa] flex flex-col justify-between font-sans text-slate-900 selection:bg-[#0f172a] selection:text-white">
      
      {/* Top Header Navigation */}
      <div className="max-w-6xl mx-auto w-full flex items-center justify-between p-4 sm:p-6 lg:px-10">
        <Logo variant="small" />

        <div className="flex items-center gap-3 sm:gap-4">
          {onGoToDashboard && (
            <button
              onClick={onGoToDashboard}
              className="bg-white/90 hover:bg-white text-slate-800 border border-slate-200/90 font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              title="Return to your active events dashboard"
            >
              <LayoutDashboard className="w-4 h-4 text-sky-700" />
              <span>Go to Dashboard</span>
            </button>
          )}

          <a
            href="/privacy"
            onClick={(e) => {
              if (onOpenPrivacyPolicy) {
                e.preventDefault();
                onOpenPrivacyPolicy();
              }
            }}
            className="text-xs sm:text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors cursor-pointer hidden sm:flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4 text-sky-700" />
            <span>Privacy Notice</span>
          </a>

          <button
            onClick={onGetStarted}
            className="bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>Get Started For Free</span>
          </button>
        </div>
      </div>

      {/* Hero Section featuring Big Logo */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 text-center space-y-6">
        
        {/* Big Logo Featured Prominently */}
        <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 p-5 sm:p-6 rounded-3xl shadow-xl shadow-slate-200/50 inline-flex flex-col items-center">
            <Logo variant="large" size="xl" />
          </div>
        </div>

        {/* Hero Headline / USP Statement */}
        <div className="space-y-3 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.2]">
            Calendars tell you when an event starts. Ahead Of Time makes sure you're ready when it does.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            Drop an entry onto your calendar or plan with our assistant, and Ahead Of Time automatically builds backward preparation milestones. Whether you’re organizing a birthday celebration, packing for a trip, or prepping a school theme day for your kids, we build in the breathing room.
          </p>
        </div>

        {/* Primary CTA Buttons */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
          {onGoToDashboard ? (
            <button
              onClick={onGoToDashboard}
              className="px-8 py-3.5 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-black text-sm sm:text-base shadow-lg shadow-slate-900/20 hover:shadow-xl hover:shadow-slate-900/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4 text-sky-300" />
              <span>Open My Dashboard</span>
            </button>
          ) : (
            <button
              onClick={onGetStarted}
              className="px-8 py-3.5 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-black text-sm sm:text-base shadow-lg shadow-slate-900/20 hover:shadow-xl hover:shadow-slate-900/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>Get Started For Free</span>
            </button>
          )}

          <button
            onClick={() => alert("Watch Demo Video: Ahead Of Time workflow walkthrough.")}
            className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm border border-slate-200 shadow-sm transition-all cursor-pointer flex items-center gap-2"
          >
            <Play className="w-4 h-4 text-[#529479] fill-[#529479]" />
            <span>Watch Demo Video</span>
          </button>
        </div>

      </div>

      {/* How the Assistant Works - Two Elements */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 border-t border-slate-200/60">
        <div className="text-center space-y-2 mb-8">
          <span className="text-xs font-black uppercase tracking-widest text-sky-800 bg-sky-100/80 px-3 py-1 rounded-full">
            Intelligent Prep Engine
          </span>
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">
            How Ahead Of Time works for you
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            The assistant can work in multiple ways:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          
          {/* Element 1 */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md shadow-slate-200/40 flex flex-col justify-between space-y-6 hover:shadow-lg transition-all group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-800 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center">1</span>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">Automatic Calendar Sync</h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  Link your calendar, and the assistant determines which events need extra preparation.
                </p>
              </div>
            </div>
          </div>

          {/* Element 2 */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md shadow-slate-200/40 flex flex-col justify-between space-y-6 hover:shadow-lg transition-all group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center">2</span>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">Interactive Assistant &amp; Planner</h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  Use the assistant to add a new event or refine your existing events.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Closing Banner */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12 text-center space-y-6">
        <div className="bg-[#0f172a] text-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-slate-900/10 space-y-6 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-3 relative z-10">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Try Ahead Of Time
            </h2>
            <p className="text-sky-200 text-sm sm:text-base font-semibold tracking-wide">
              Less scrambling. More headspace. Time to actually enjoy it.
            </p>
          </div>

          <div className="pt-2 relative z-10">
            <button
              onClick={onGetStarted}
              className="px-8 py-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-base shadow-md hover:shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-sky-700" />
              <span>Get Started For Free</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-500 flex flex-wrap items-center justify-center gap-4 py-4">
          <a
            href="/privacy"
            onClick={(e) => {
              if (onOpenPrivacyPolicy) {
                e.preventDefault();
                onOpenPrivacyPolicy();
              }
            }}
            className="hover:text-slate-900 underline cursor-pointer"
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
