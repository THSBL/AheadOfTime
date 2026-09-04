import React from 'react';
import { ShieldCheck, X, Calendar, Lock, Database, Trash2, Eye } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Calendar className="w-4 h-4 text-sky-600" />
              <span>1. Purpose of Calendar Metadata Processing</span>
            </div>
            <p>
              When you connect or scan your Google Calendar, Ahead Of Time accesses read-only metadata (event title, start date/time, and general location) strictly to build backward preparation milestones, breathing room, and timely reminders. We do not inspect private attendee notes or body attachments beyond what is required to categorize events.
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
              <span>3. Zero Commercialization &amp; No Third-Party Reselling</span>
            </div>
            <p>
              We never sell, rent, monetize, or transfer your personal preferences or calendar metadata to third-party advertisers, data aggregators, or brokers. Processing is purely functional for your calendar planning assistant.
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
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
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
