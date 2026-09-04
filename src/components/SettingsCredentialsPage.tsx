import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { ArrowLeft, ShieldCheck, Key, CalendarDays, RefreshCw } from 'lucide-react';

interface SettingsCredentialsPageProps {
  onSyncComplete?: (events: any[]) => void;
  events?: any[];
}

export const SettingsCredentialsPage: React.FC<SettingsCredentialsPageProps> = ({ onSyncComplete, events = [] }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl transition font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold uppercase tracking-wider">
            <Key className="w-4 h-4" />
            Settings / Credentials
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 w-full space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Calendar Integrations & API Tokens</h1>
          <p className="text-xs text-slate-400">
            Manage your connected Google Calendar, Google Tasks authorization, and milestone synchronization options.
          </p>
        </div>

        <GoogleCalendarSync
          onClose={() => navigate('/dashboard')}
          onSyncComplete={(syncedEvents) => {
            onSyncComplete?.(syncedEvents);
          }}
          existingEvents={events}
        />
      </main>
    </div>
  );
};
