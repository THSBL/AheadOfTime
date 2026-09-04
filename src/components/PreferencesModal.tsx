import React, { useState } from 'react';
import { 
  X, 
  Sliders, 
  ShieldCheck, 
  RotateCcw, 
  Check, 
  Sparkles, 
  Calendar, 
  User, 
  Users, 
  Briefcase,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { OnboardingProfile, AgeRange, FamilyStatus, CalendarType } from '../types';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: OnboardingProfile | null;
  onSaveProfile: (profile: OnboardingProfile) => void;
  onOpenPrivacyPolicy: () => void;
  agendaHorizonMonths: number;
  onAgendaHorizonChange: (months: number) => void;
  onResetDemo: () => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onOpenPrivacyPolicy,
  agendaHorizonMonths,
  onAgendaHorizonChange,
  onResetDemo,
}) => {
  if (!isOpen) return null;

  const [ageRange, setAgeRange] = useState<AgeRange>(profile?.ageRange || '26–35');
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus>(profile?.familyStatus || 'Couple with kids');
  const [calendarType, setCalendarType] = useState<CalendarType>(profile?.calendarType || 'Mixed (Personal & Work)');
  const [horizon, setHorizon] = useState<number>(agendaHorizonMonths || 6);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const token = getStoredAccessToken();
  const isGoogleConnected = Boolean(token && !isTokenExpired());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: OnboardingProfile = {
      ageRange,
      familyStatus,
      calendarType,
      privacyConsentAccepted: true,
      completedAt: profile?.completedAt || new Date().toISOString(),
    };
    onSaveProfile(updated);
    onAgendaHorizonChange(horizon);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-50/90 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Sliders className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Application Preferences &amp; Calibration
              </h3>
              <p className="text-xs text-slate-500">
                Configure prep heuristics, calendar horizons, and testing controls
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto">
          
          {/* Family / Household Status */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-sky-600" />
              <span>Household &amp; Family Context</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['Single / Solo', 'Couple (No kids)', 'Couple with kids', 'Single Parent'] as FamilyStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFamilyStatus(st)}
                  className={`p-2.5 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer ${
                    familyStatus === st
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Age Demographics */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-sky-600" />
              <span>Age Demographic</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['18–25', '26–35', '36–50', '50+'] as AgeRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setAgeRange(range)}
                  className={`p-2 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                    ageRange === range
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar Type */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-sky-600" />
              <span>Calendar Context</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Personal Only', 'Mixed (Personal & Work)', 'Family Shared'] as CalendarType[]).map((cal) => (
                <button
                  key={cal}
                  type="button"
                  onClick={() => setCalendarType(cal)}
                  className={`p-2.5 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                    calendarType === cal
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cal}
                </button>
              ))}
            </div>
          </div>

          {/* Agenda Horizon */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              <span>Default Scanning Horizon</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { months: 3, label: '3 Months' },
                { months: 6, label: '6 Months' },
                { months: 12, label: '12 Months' },
              ].map((h) => (
                <button
                  key={h.months}
                  type="button"
                  onClick={() => setHorizon(h.months)}
                  className={`p-2 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                    horizon === h.months
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* Google Calendar & Tasks Sync Status */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                <span>Google Calendar &amp; Tasks Sync</span>
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                isGoogleConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                {isGoogleConnected ? 'Connected' : 'Offline / Local'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Native Google Tasks &amp; Events Integration</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                T-Minus preparation milestones sync directly into your Google Tasks layer, appearing in your Google Calendar sidebar and task lists without cluttering your main schedule.
              </p>
            </div>
          </div>

          {/* Developer / Testing Section */}
          <div className="pt-2 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Developer / QA Testing</span>
              </span>
              <button
                type="button"
                onClick={onOpenPrivacyPolicy}
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold underline cursor-pointer"
              >
                Privacy Notice
              </button>
            </div>
            
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-amber-950">
                  Reset Demo &amp; First-Time Experience
                </p>
                <p className="text-[11px] text-amber-800 leading-tight">
                  Clears local storage and reloads the application to test the landing &amp; onboarding flow.
                </p>
              </div>

              <button
                type="button"
                id="btn-reset-demo-storage"
                onClick={onResetDemo}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo Data</span>
              </button>
            </div>
          </div>

          {/* Footer Save / Cancel */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md shadow-slate-900/20 flex items-center gap-1.5 cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Save Preferences</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

