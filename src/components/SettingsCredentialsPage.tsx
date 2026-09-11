import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleCalendarIntegrationCard } from './GoogleCalendarIntegrationCard';
import { TelegramIntegrationCard } from './TelegramIntegrationCard';
import { AdvancedDeveloperSettingsDrawer } from './AdvancedDeveloperSettingsDrawer';
import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles, Settings2, Check } from 'lucide-react';
import { CalendarEvent, OnboardingProfile } from '../types';
import { getCurrentUser, loadUserEvents } from '../services/accountManager';
import { useUserProfile } from '../contexts/UserProfileContext';

interface SettingsCredentialsPageProps {
  onSyncComplete?: (events: CalendarEvent[]) => void;
  events?: CalendarEvent[];
}

export const SettingsCredentialsPage: React.FC<SettingsCredentialsPageProps> = ({ 
  onSyncComplete, 
  events: propEvents 
}) => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    if (propEvents && propEvents.length > 0) return propEvents;
    const user = currentUser;
    if (!user?.id) return [];
    return loadUserEvents(user.id);
  });

  const { profile: onboardingProfile, saveProfile } = useUserProfile();

  const [editFamilyStructure, setEditFamilyStructure] = useState<string>(onboardingProfile?.family_structure || 'single');
  const [editCalendarScope, setEditCalendarScope] = useState<string>(onboardingProfile?.calendar_type || 'mixed');
  const [editHomeLocation, setEditHomeLocation] = useState<string>(onboardingProfile?.homeZipOrLocation || '');
  const [savedSuccessMessage, setSavedSuccessMessage] = useState(false);

  useEffect(() => {
    if (onboardingProfile) {
      setEditFamilyStructure(onboardingProfile.family_structure || 'single');
      setEditCalendarScope(onboardingProfile.calendar_type || 'mixed');
      setEditHomeLocation(onboardingProfile.homeZipOrLocation || '');
    }
  }, [onboardingProfile]);

  const handleSaveQuestionnaireChanges = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfile: OnboardingProfile = {
      ...(onboardingProfile || {}),
      family_structure: editFamilyStructure as any,
      calendar_type: editCalendarScope as any,
      familyStatus: editFamilyStructure === 'family_with_kids' ? 'Family with kids' : editFamilyStructure === 'couple' ? 'Couple' : 'Single',
      calendarType: editCalendarScope === 'business' ? 'Business' : editCalendarScope === 'personal' ? 'Personal only' : 'Mixed (Personal & Work)',
      homeZipOrLocation: editHomeLocation,
    };
    saveProfile(updatedProfile);
    setSavedSuccessMessage(true);
    setTimeout(() => setSavedSuccessMessage(false), 3000);
  };

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
          <TelegramIntegrationCard events={events} userId={currentUser?.id} />

          {/* CARD 3: QUESTIONNAIRE PROFILE & PRESET HEURISTICS */}
          <div className="bg-white border border-sky-200/90 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-3 mb-3">
              <span className="p-2 rounded-xl bg-sky-100 text-sky-900 border border-sky-200">
                <Settings2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Questionnaire Profile &amp; Preset Heuristics</h3>
                <p className="text-xs text-slate-500">
                  Update your questionnaire details below. Changes will immediately adjust your active preset templates and workflow rules.
                </p>
              </div>
            </div>

            {savedSuccessMessage && (
              <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Profile updated successfully! Presets adjusted accordingly.</span>
              </div>
            )}

            <form onSubmit={handleSaveQuestionnaireChanges} className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Family Structure</label>
                <select
                  value={editFamilyStructure}
                  onChange={(e) => setEditFamilyStructure(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-slate-900"
                >
                  <option value="single">Single / Solo</option>
                  <option value="couple">Couple / Partner</option>
                  <option value="family_with_kids">Family with Kids</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Calendar Scope</label>
                <select
                  value={editCalendarScope}
                  onChange={(e) => setEditCalendarScope(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-slate-900"
                >
                  <option value="personal">Personal Only</option>
                  <option value="mixed">Mixed (Personal &amp; Work)</option>
                  <option value="business">Business / Professional</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Home Base / Location</label>
                <input
                  type="text"
                  value={editHomeLocation}
                  onChange={(e) => setEditHomeLocation(e.target.value)}
                  placeholder="e.g. London, UK or 94107"
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Update Profile &amp; Adjust Presets</span>
                </button>
              </div>
            </form>
          </div>
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
