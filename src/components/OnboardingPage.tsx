import React, { useState } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Calendar, 
  Users, 
  User, 
  Briefcase 
} from 'lucide-react';
import { OnboardingProfile, AgeRange, FamilyStatus, CalendarType } from '../types';
import { Logo } from './Logo';

interface OnboardingPageProps {
  initialProfile?: Partial<OnboardingProfile>;
  onComplete: (profile: OnboardingProfile, action: 'connect_calendar' | 'go_dashboard') => void;
  onOpenPrivacyPolicy: () => void;
}

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  initialProfile,
  onComplete,
  onOpenPrivacyPolicy,
}) => {
  const [ageRange, setAgeRange] = useState<AgeRange>(initialProfile?.ageRange || '26–35');
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus>(initialProfile?.familyStatus || 'Couple with kids');
  const [calendarType, setCalendarType] = useState<CalendarType>(initialProfile?.calendarType || 'Mixed (Personal & Work)');
  const [consentChecked, setConsentChecked] = useState<boolean>(initialProfile?.privacyConsentAccepted ?? false);
  const [showConsentError, setShowConsentError] = useState<boolean>(false);

  const handleSubmit = (action: 'connect_calendar' | 'go_dashboard') => {
    if (!consentChecked) {
      setShowConsentError(true);
      return;
    }
    setShowConsentError(false);

    const profile: OnboardingProfile = {
      ageRange,
      familyStatus,
      calendarType,
      privacyConsentAccepted: true,
      completedAt: new Date().toISOString(),
    };

    onComplete(profile, action);
  };

  return (
    <div className="relative z-10 min-h-screen w-full bg-[#f1f7fe] flex flex-col justify-between p-4 sm:p-6 lg:p-10 font-sans text-slate-900 overflow-y-auto">
      
      {/* Top Brand Header */}
      <div className="max-w-3xl mx-auto w-full flex items-center justify-between py-2">
        <Logo variant="small" />

        <button
          onClick={onOpenPrivacyPolicy}
          className="text-xs text-slate-500 hover:text-slate-900 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
          <span>Privacy &amp; Data Notice</span>
        </button>
      </div>

      {/* Main Single-Screen Onboarding Card */}
      <div className="max-w-xl mx-auto w-full my-auto py-6">
        <div className="relative z-20 bg-white border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-200/50 p-6 sm:p-8 space-y-6 isolate">
          
          {/* Explanation of why we need this information */}
          <div className="space-y-2 border-b border-slate-100 pb-5">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Why we need this information
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              We use your life stage, family setup, and calendar type to calibrate realistic preparation milestones and buffer times for your events (e.g. extra prep time for family outings). Your preferences remain private and secure.
            </p>
          </div>

          {/* Intake Form Fields */}
          <div className="space-y-5">
            
            {/* Age Range */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-700" />
                <span>Your Life Stage / Age Range</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['18–25', '26–35', '36–50', '51+'] as AgeRange[]).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setAgeRange(range)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      ageRange === range
                        ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            {/* Family Status */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-700" />
                <span>Household &amp; Family Status</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Single', 'Couple', 'Couple with kids'] as FamilyStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFamilyStatus(status)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center truncate ${
                      familyStatus === status
                        ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar Type */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-sky-700" />
                <span>Primary Calendar Focus</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['Personal only', 'Business only', 'Mixed (Personal & Work)'] as CalendarType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCalendarType(type)}
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                      calendarType === type
                        ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Clean Agenda Guarantee & Tasks Explanation */}
          <div className="p-3.5 bg-sky-50/70 border border-sky-200/90 rounded-2xl flex items-start gap-3">
            <div className="w-7 h-7 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="font-bold text-sky-950">
                Clean Agenda Guarantee
              </p>
              <p className="text-sky-900/90 leading-relaxed">
                Ahead of Time syncs preparation milestones directly to your <strong className="text-sky-950">Google Tasks</strong> layer, giving you a dedicated action checklist without cluttering your primary calendar events.
              </p>
            </div>
          </div>

          {/* Compliance Checkpoint: Privacy & Data Use Notice */}
          <div className={`p-4 rounded-2xl border transition-all ${
            showConsentError 
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-200' 
              : 'bg-slate-50/80 border-slate-200'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => {
                  setConsentChecked(e.target.checked);
                  if (e.target.checked) setShowConsentError(false);
                }}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer mt-0.5 shrink-0"
              />
              <div className="text-xs text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">
                  I agree to the processing of my calendar and profile data to generate preparation schedules.
                </span>{' '}
                Your metadata is processed solely to build backward preparation milestones and filter routine meeting noise.{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPrivacyPolicy();
                  }}
                  className="text-sky-700 hover:text-sky-900 font-bold underline underline-offset-2 ml-1 cursor-pointer"
                >
                  View full Privacy Policy
                </button>
              </div>
            </label>
            {showConsentError && (
              <p className="text-[11px] text-rose-700 font-semibold mt-2 pl-7">
                Please check the consent agreement to proceed with Ahead Of Time setup.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              id="btn-save-and-connect-calendar"
              onClick={() => handleSubmit('connect_calendar')}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer group"
            >
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span>Connect Calendar &amp; Start</span>
              <ArrowRight className="w-4 h-4 text-sky-300 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => handleSubmit('go_dashboard')}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium py-1 transition-colors cursor-pointer"
              >
                Or explore empty agenda overview first &rarr;
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Footer reassurance */}
      <div className="max-w-2xl mx-auto w-full text-center text-[11px] text-slate-500 py-2">
        Zero data selling &bull; Read-only event metadata processing &bull; Client-side encrypted session tokens
      </div>

    </div>
  );
};
