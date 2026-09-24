import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { usePageMeta } from '../utils/usePageMeta';
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  Sliders, 
  ShieldCheck, 
  Zap, 
  RefreshCw, 
  Smartphone,
  ChevronLeft
} from 'lucide-react';

export const FeaturesPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta(
    'Features - Ahead Of Time',
    'See how Ahead Of Time turns any event or trip into a reverse-planned countdown of prep milestones, synced to Google Calendar and Google Tasks.'
  );

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
              onClick={() => navigate('/dashboard')}
              className="text-xs sm:text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Product Capabilities
          </div>
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
                <p className="text-xs text-slate-400 mt-1">Type it, say it, or connect your calendar - however's easiest for you.</p>
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
        </div>

        {/* CTA */}
        <div className="text-center space-y-4 py-8">
          <h2 className="text-2xl font-bold text-white">Ready to prepare ahead of time?</h2>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition text-sm shadow-lg inline-flex items-center gap-2"
          >
            Launch Ahead Of Time
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
            <button onClick={() => navigate('/feedback')} className="hover:text-slate-300 transition">Beta Feedback</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
