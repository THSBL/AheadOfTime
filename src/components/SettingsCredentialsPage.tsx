import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GoogleCalendarIntegrationCard } from './GoogleCalendarIntegrationCard';
import { TelegramIntegrationCard } from './TelegramIntegrationCard';
import { RecentlyDeletedEventsCard } from './RecentlyDeletedEventsCard';
import { ArrowLeft, Check, UserRound } from 'lucide-react';
import { CalendarEvent, OnboardingProfile } from '../types';
import { getCurrentUser, loadUserEvents } from '../services/accountManager';
import { useAccountKey } from '../hooks/useAccountKey';
import { useUserProfile } from '../contexts/UserProfileContext';
import { AiPlanningCard } from './AiPlanningCard';
import { DeleteAccountCard } from './DeleteAccountCard';
import { SettingsGroup, SettingsRow, SettingsPill, rowPrimaryClass } from './SettingsRow';
import { openSignIn } from './SignInModal';
import { UpdatesSettings } from './UpdatesSettings';
import { CalendarHabitsCard } from './CalendarHabitsCard';
import { CalendarFeedCard } from './CalendarFeedCard';

export type SettingsTab = 'connections' | 'account' | 'updates';
const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'connections', label: 'Connections' },
  { id: 'account', label: 'Account' },
  { id: 'updates', label: 'Updates' },
];

/** /settings/account and /settings/updates; everything else (incl. the old /settings/credentials) is Connections. */
export function settingsTabFromPath(pathname: string): SettingsTab {
  if (pathname.startsWith('/settings/account')) return 'account';
  if (pathname.startsWith('/settings/updates')) return 'updates';
  return 'connections';
}

interface SettingsCredentialsPageProps {
  onSyncComplete?: (events: CalendarEvent[]) => void;
  events?: CalendarEvent[];
}

export const SettingsCredentialsPage: React.FC<SettingsCredentialsPageProps> = ({ 
  onSyncComplete, 
  events: propEvents 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const tab = settingsTabFromPath(location.pathname);
  const accountKey = useAccountKey();
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
  const [editHasPet, setEditHasPet] = useState<boolean>(onboardingProfile?.hasPet ?? false);
  const [savedSuccessMessage, setSavedSuccessMessage] = useState(false);

  useEffect(() => {
    if (onboardingProfile) {
      setEditFamilyStructure(onboardingProfile.family_structure || 'single');
      setEditCalendarScope(onboardingProfile.calendar_type || 'mixed');
      setEditHomeLocation(onboardingProfile.homeZipOrLocation || '');
      setEditHasPet(onboardingProfile.hasPet ?? false);
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
      hasPet: editHasPet,
    };
    saveProfile(updatedProfile);
    setSavedSuccessMessage(true);
    setTimeout(() => setSavedSuccessMessage(false), 3000);
  };

  const fieldLabel = 'block text-xs font-bold text-slate-600 mb-1';
  const fieldControl =
    'w-full text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-slate-400';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Header: back, title, and the three tabs */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-xl transition font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Settings</h1>
          </div>
          <nav className="flex mt-2" role="tablist" aria-label="Settings sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => navigate(`/settings/${t.id}${location.search}`, { replace: true })}
                className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                  tab === t.id ? 'text-[#182A42] border-[#182A42]' : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto px-4 py-5 w-full space-y-3">
        {tab === 'connections' && (
          <SettingsGroup>
            {/* Who you are signed in as, and a way in that is not only Google:
                Outlook and Apple Calendar users sign in with an email link. */}
            <SettingsRow
              icon={<UserRound className="w-4 h-4" />}
              title="Account"
              subtitle={
                currentUser?.email
                  ? `${currentUser.email}${currentUser.provider === 'email' ? ' (email link)' : currentUser.provider === 'google' ? ' (Google)' : ''}`
                  : 'Not signed in - use Google or an email link'
              }
              right={
                currentUser?.email ? (
                  <SettingsPill on>Signed in</SettingsPill>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSignIn('Use Outlook or Apple Calendar? Get a sign-in link by email. Use Google Calendar? Continue with Google.')}
                    className={rowPrimaryClass}
                  >
                    Sign in
                  </button>
                )
              }
            />
            {/* Not on Google: the calendar feed is how tasks reach your
                calendar, so it comes first; Google stays available below. */}
            {currentUser?.provider !== 'google' && <CalendarFeedCard key={accountKey} />}
            <GoogleCalendarIntegrationCard
              events={events}
              onSyncComplete={(synced) => {
                setEvents(synced);
                onSyncComplete?.(synced);
              }}
            />
            {currentUser?.provider === 'google' && <CalendarFeedCard key={accountKey} />}
            <TelegramIntegrationCard userId={currentUser?.id} />
            <AiPlanningCard />
          </SettingsGroup>
        )}

        {tab === 'account' && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">Profile</p>
            <form onSubmit={handleSaveQuestionnaireChanges} className="space-y-3">
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs divide-y divide-slate-100">
                <div className="p-3.5">
                  <label className={fieldLabel} htmlFor="profile-household">Household</label>
                  <select id="profile-household" value={editFamilyStructure} onChange={(e) => setEditFamilyStructure(e.target.value)} className={fieldControl}>
                    <option value="single">Single / Solo</option>
                    <option value="couple">Couple / Partner</option>
                    <option value="family_with_kids">Family with kids</option>
                  </select>
                </div>
                <div className="p-3.5">
                  <label className={fieldLabel} htmlFor="profile-calendar">Calendar</label>
                  <select id="profile-calendar" value={editCalendarScope} onChange={(e) => setEditCalendarScope(e.target.value)} className={fieldControl}>
                    <option value="personal">Personal only</option>
                    <option value="mixed">Personal &amp; work</option>
                    <option value="business">Work only</option>
                  </select>
                </div>
                <div className="p-3.5">
                  <label className={fieldLabel} htmlFor="profile-home">Home base</label>
                  <input
                    id="profile-home"
                    type="text"
                    value={editHomeLocation}
                    onChange={(e) => setEditHomeLocation(e.target.value)}
                    placeholder="e.g. London, UK"
                    className={fieldControl}
                  />
                </div>
                <div className="p-3.5">
                  <p className={fieldLabel}>Pets that depend on you</p>
                  <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5">
                    {([true, false] as const).map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setEditHasPet(val)}
                        aria-pressed={editHasPet === val}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          editHasPet === val ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {val ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                {savedSuccessMessage && (
                  <span className="text-xs font-semibold text-[#447463] flex items-center gap-1 animate-in fade-in">
                    <Check className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                >
                  Save profile
                </button>
              </div>
            </form>

            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1 pt-2">Your calendar habits</p>
            <CalendarHabitsCard />

            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1 pt-2">Data</p>
            <SettingsGroup>
              <RecentlyDeletedEventsCard key={accountKey} />
              {currentUser?.id && <DeleteAccountCard />}
            </SettingsGroup>
          </>
        )}

        {tab === 'updates' && <UpdatesSettings />}
      </main>
    </div>
  );
};
