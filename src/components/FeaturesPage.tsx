import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
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
            Ahead Of Time reverse-engineers your upcoming events into structured T-Minus milestones. Never get caught off-guard by sold-out venues, custom gift lead times, or last-minute grocery runs.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-3 hover:border-sky-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">T-Minus Reverse Timelines</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Calculates exact lead times backwards from your event date. Automatically triggers reminders for T-30d bookings, T-14d gifts, and T-1d prep.
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
            <h3 className="text-lg font-bold text-white">Smart Heuristic Intelligence</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Analyzes event context like birthday gifts, private karaoke booths, travel visa lead times, or bakery reservation cutoff dates automatically.
            </p>
          </div>
        </div>

        {/* Detailed Section */}
        <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-8 space-y-8">
          <h2 className="text-2xl font-bold text-white text-center">Complete Event Prep Workflow</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Import or Tell the Agent</h4>
                <p className="text-xs text-slate-400 mt-1">Connect your calendar or dictate your upcoming plans in plain English or voice memo.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Answer Key Parameter Questions</h4>
                <p className="text-xs text-slate-400 mt-1">Select gift strategy, costume theme, or dining plans via multiple-choice intake chips.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Review Timeline Radar</h4>
                <p className="text-xs text-slate-400 mt-1">Visualize lead times across an interactive timeline radar with countdown badges.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm">Export & Sync Tasks</h4>
                <p className="text-xs text-slate-400 mt-1">Export as ICS calendar files or sync directly to Google Tasks with one click.</p>
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
