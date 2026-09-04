import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Clock, Bell, Sliders, CheckCircle2 } from 'lucide-react';

export const SettingsProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem('aot_user_name') || 'Calendar Host');
  const [timezone, setTimezone] = useState(() => localStorage.getItem('aot_user_timezone') || 'Europe/London (GMT+1)');
  const [defaultLeadWeeks, setDefaultLeadWeeks] = useState(() => localStorage.getItem('aot_default_lead_weeks') || '3');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('aot_user_name', name);
    localStorage.setItem('aot_user_timezone', timezone);
    localStorage.setItem('aot_default_lead_weeks', defaultLeadWeeks);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

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
            <User className="w-4 h-4" />
            Settings / Profile
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Profile & Preferences</h1>
          <p className="text-xs text-slate-400">
            Configure your timezone, default preparation lead time buffers, and notification preferences.
          </p>
        </div>

        <form onSubmit={handleSave} className="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 space-y-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Europe/London (GMT+1)">Europe/London (GMT+1)</option>
                <option value="America/New_York (EST)">America/New_York (EST)</option>
                <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</option>
                <option value="Europe/Paris (CET)">Europe/Paris (CET)</option>
                <option value="Asia/Tokyo (JST)">Asia/Tokyo (JST)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Lead Time Buffer</label>
              <select
                value={defaultLeadWeeks}
                onChange={(e) => setDefaultLeadWeeks(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="2">2 Weeks Before Event</option>
                <option value="3">3 Weeks Before Event (Recommended)</option>
                <option value="4">4 Weeks Before Event</option>
                <option value="6">6 Weeks Before Event</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            {savedSuccess ? (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Preferences saved!
              </span>
            ) : <span />}

            <button
              type="submit"
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-md"
            >
              Save Profile Changes
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};
