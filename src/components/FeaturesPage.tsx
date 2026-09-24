import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { usePageMeta } from '../utils/usePageMeta';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import {
  Clock,
  Calendar,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Zap,
  RefreshCw,
  Send,
  Globe,
} from 'lucide-react';

// Same "has this browser already been through onboarding or connected a
// calendar" check ProtectedRoute/LandingRoute use - without it, "Go to
// Dashboard" for a brand-new visitor just bounces straight back to "/"
// (ProtectedRoute redirects an unonboarded visitor away from /dashboard),
// which looked identical to clicking "Overview".
const hasEnteredAppBefore = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (
      localStorage.getItem('aot_onboarding_completed') === 'true' ||
      localStorage.getItem('has_completed_onboarding') === 'true' ||
      localStorage.getItem('aot_calendar_connected') === 'true' ||
      Boolean(getStoredAccessToken() && !isTokenExpired())
    );
  } catch {
    return false;
  }
};

export const FeaturesPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta(
    'Features - Ahead Of Time',
    'See how Ahead Of Time turns any event or trip into a reverse-planned countdown of prep milestones, synced to Google Calendar and Google Tasks.'
  );

  const goToAppOrOnboarding = () => navigate(hasEnteredAppBefore() ? '/dashboard' : '/onboarding');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <Logo variant="dark" size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              Overview
            </button>
            <button
              onClick={goToAppOrOnboarding}
              className="text-xs sm:text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md"
            >
              {hasEnteredAppBefore() ? 'Go to Dashboard' : 'Get Started For Free'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Backward Planning Built For Real Life
          </h1>
          <p className="text-slate-400 text-sm sm:text-lg leading-relaxed">
            Ahead Of Time turns any event into a simple countdown of what to do and when. Never get caught off guard by sold-out venues, gift-shopping deadlines, or last-minute grocery runs.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-3 hover:border-sky-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">A Countdown That Plans Itself</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Works backwards from your event date to figure out exactly when to book, buy, and prep - no spreadsheets required.
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-3 hover:border-sky-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Google Calendar & Tasks Sync</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Seamless 2-way synchronization with Google Calendar and Google Tasks. Milestones appear as scheduled tasks with due dates in your native workflow.
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-3 hover:border-sky-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Knows What You'll Need</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Understands what your event actually needs - gifts, costumes, travel documents, bakery orders - and builds the right plan automatically.
            </p>
          </div>
        </div>

        {/* Detailed Section - three steps, mirroring the three-stripe shield
            on the sign-in/returning-user screens: tell us, we plan, you're
            set. */}
        <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-8 space-y-8">
          <h2 className="text-2xl font-bold text-white text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Tell Us What's Coming</h4>
                <p className="text-xs text-slate-400 mt-1">Type it in the app, message our Telegram bot, or just keep using Google Calendar.</p>
              </div>
            </div>

            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">We Build Your Plan</h4>
                <p className="text-xs text-slate-400 mt-1">We line up every gift, booking, and task, and only ask if something's still unclear.</p>
              </div>
            </div>

            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Stay Ahead, Automatically</h4>
                <p className="text-xs text-slate-400 mt-1">Everything syncs to Google Calendar and Tasks, ready right when you need it.</p>
              </div>
            </div>
          </div>

          {/* Three equally-valid ways in, always kept in sync - the app
              itself doesn't have to be where an event started life. */}
          <div className="pt-6 border-t border-slate-800 space-y-6">
            <p className="text-center text-sm text-slate-400 max-w-md mx-auto">
              Add something from wherever you already are. The Website, Telegram, and Google Calendar all stay in sync automatically.
            </p>
            <div className="relative w-full max-w-sm mx-auto aspect-[4/3]">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 220" fill="none" aria-hidden="true">
                <line x1="150" y1="40" x2="45" y2="185" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 5" />
                <line x1="150" y1="40" x2="255" y2="185" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 5" />
                <line x1="45" y1="185" x2="255" y2="185" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 5" />
              </svg>

              <div className="absolute left-1/2 top-0 -translate-x-1/2 flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center shadow-lg">
                  <Globe className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-white whitespace-nowrap">Website</span>
              </div>

              <div className="absolute left-0 bottom-0 flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg">
                  <Send className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-white whitespace-nowrap">Telegram</span>
              </div>

              <div className="absolute right-0 bottom-0 flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center shadow-lg">
                  <Calendar className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-white whitespace-nowrap">Google Calendar</span>
              </div>

              <div className="absolute left-1/2 top-[68%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-full px-3 py-1 shadow-md">
                <RefreshCw className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Always in sync</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4 py-8">
          <h2 className="text-2xl font-bold text-white">Ready to prepare ahead of time?</h2>
          <button
            onClick={goToAppOrOnboarding}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition text-sm shadow-lg inline-flex items-center gap-2"
          >
            {hasEnteredAppBefore() ? 'Launch Ahead Of Time' : 'Get Started For Free'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Ahead Of Time. All rights reserved.</p>
          <div className="flex gap-4">
            <button onClick={() => navigate('/privacy')} className="hover:text-slate-300 transition">Privacy Policy</button>
            <button onClick={() => navigate('/feedback')} className="hover:text-slate-300 transition">Feedback</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
