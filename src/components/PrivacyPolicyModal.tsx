import React from 'react';
import { ShieldCheck, X, Calendar, Lock, Database, Trash2, Eye, ExternalLink } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFullPage?: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ 
  isOpen, 
  onClose,
  onOpenFullPage 
}) => {
  if (!isOpen) return null;

  const handleOpenPage = (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
    if (onOpenFullPage) {
      onOpenFullPage();
    } else {
      window.location.href = '/privacy';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900 max-h-[88vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Privacy &amp; Data Use Policy
              </h2>
              <p className="text-xs text-slate-300">
                How Ahead Of Time processes your calendar and onboarding preferences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Policy Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-slate-600 leading-relaxed">
          
          {/* Quick link to standalone /privacy page */}
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
            <span className="text-emerald-950 font-medium">
              Looking for our dedicated public legal disclosure page?
            </span>
            <button
              type="button"
              onClick={handleOpenPage}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-colors shrink-0 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Open /privacy</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Calendar className="w-4 h-4 text-sky-600" />
              <span>1. Google OAuth Sensitive Scopes &amp; Limited Use</span>
            </div>
            <p>
              Ahead Of Time requests these Google OAuth scopes to scan upcoming schedule entries and insert backward-planned preparation milestones:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 text-xs text-slate-600 font-medium">
              <li>
                <code className="font-mono text-sky-900 font-bold bg-sky-50 px-1 py-0.5 rounded">.../auth/calendar.readonly</code>: Used during initial onboarding and daily scans to read primary calendar metadata without altering existing entries, identifying events requiring lead time (trips, parties, school theme days).
              </li>
              <li>
                <code className="font-mono text-sky-900 font-bold bg-sky-50 px-1 py-0.5 rounded">.../auth/calendar.events</code>: Necessary to read full event details and directly write calculated T-minus preparation milestones (reservations, gifts, packing reminders) onto your schedule with lead time.
              </li>
              <li>
                <code className="font-mono text-sky-900 font-bold bg-sky-50 px-1 py-0.5 rounded">.../auth/tasks</code>: Required to synchronize and manage preparation checklists directly in Google Tasks for users who prefer actionable to-do items alongside or instead of direct calendar time blocks.
              </li>
            </ul>
            <p className="text-xs pt-1">
              Ahead Of Time&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a 
                href="https://developers.google.com/terms/api-services-user-data-policy" 
                target="_blank" 
                rel="noreferrer" 
                className="underline font-bold text-sky-900"
              >
                Google API Services User Data Policy
              </a>, including the Limited Use requirements.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Eye className="w-4 h-4 text-sky-600" />
              <span>2. Demographic &amp; Scheduling Calibration</span>
            </div>
            <p>
              Information collected during onboarding (age bracket, family status, and calendar focus) is utilized as a calibration filter for your preparation assistant:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500 text-xs">
              <li><strong>Family Status (Couple with kids):</strong> Enables scanning for school projects, spirit weeks, and youth activity milestones.</li>
              <li><strong>Calendar Type (Mixed):</strong> Activates noise-reduction filters to suppress internal standups, 1:1 syncs, and routine work meetings.</li>
              <li><strong>Age Range:</strong> Calibrates milestone lead-time heuristics (e.g., earlier travel bookings vs. short-notice micro-decisions).</li>
            </ul>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Lock className="w-4 h-4 text-sky-600" />
              <span>3. Commercialization, Ads &amp; No AI Training Policy</span>
            </div>
            <p>
              We <strong>never sell, rent, or trade</strong> your Google user data or calendar metadata to data brokers or ad networks. To keep the app viable, non-targeted, contextual ads or optional subscription tiers may be offered in the future. No Google API data is ever shared with ad providers or used for targeted ads. We never use Google Workspace API data to train generalized AI foundation models.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Database className="w-4 h-4 text-sky-600" />
              <span>4. Storage &amp; Cookies</span>
            </div>
            <p>
              We use client-side local storage and functional cookies to remember your calibration parameters and authentication state across browser sessions. You may clear this data anytime via the app controls or your browser settings.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>5. Right to Erasure &amp; Disconnection</span>
            </div>
            <p>
              You have complete ownership over your schedule data. You can disconnect your Google Calendar at any time with a single click, which instantly revokes session access and purges synchronized metadata from your client device.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenPage}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium underline cursor-pointer"
          >
            View dedicated /privacy page
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Understood &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
