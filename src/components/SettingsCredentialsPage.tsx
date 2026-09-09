import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleCalendarIntegrationCard } from './GoogleCalendarIntegrationCard';
import { TelegramIntegrationCard } from './TelegramIntegrationCard';
import { AdvancedDeveloperSettingsDrawer } from './AdvancedDeveloperSettingsDrawer';
import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { CalendarEvent } from '../types';
import { getCurrentUser, loadUserEvents } from '../services/accountManager';

interface SettingsCredentialsPageProps {
  onSyncComplete?: (events: CalendarEvent[]) => void;
  events?: CalendarEvent[];
}

export const SettingsCredentialsPage: React.FC<SettingsCredentialsPageProps> = ({ 
  onSyncComplete, 
  events: propEvents 
}) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    if (propEvents && propEvents.length > 0) return propEvents;
    const user = getCurrentUser();
    if (!user?.id) return [];
    return loadUserEvents(user.id);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-sky-100 selection:text-sky-900">
      {/* Top Header Bar */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-xl transition font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200/70 px-2.5 py-1 rounded-full uppercase tracking-wider">
              Integration Hub
            </span>
          </div>
        </div>
      </header>

      {/* Main Container: max-w-xl mx-auto px-4 py-8 */}
      <main className="flex-1 max-w-xl mx-auto px-4 py-8 sm:py-10 w-full space-y-6">
        {/* Page Title & Intro */}
        <div className="space-y-1.5 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Connect Your Services
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg leading-relaxed">
            Link your accounts to automatically synchronize event lead-up checklists, scan flight details, and receive proactive mobile reminders.
          </p>
        </div>

        {/* 2 Streamlined Cards */}
        <div className="space-y-4">
          {/* CARD 1: GOOGLE CALENDAR & TASKS */}
          <GoogleCalendarIntegrationCard
            events={events}
            onSyncComplete={(synced) => {
              setEvents(synced);
              onSyncComplete?.(synced);
            }}
          />

          {/* CARD 2: TELEGRAM ASSISTANT BOT */}
          <TelegramIntegrationCard events={events} />
        </div>

        {/* Collapsible Advanced Developer Drawer */}
        <div className="pt-2">
          <AdvancedDeveloperSettingsDrawer events={events} />
        </div>

        {/* Done / Return to Dashboard Action */}
        <div className="pt-4 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Return to Dashboard</span>
          </button>

          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Your authentication tokens are stored securely and never shared.</span>
          </p>
        </div>
      </main>
    </div>
  );
};
