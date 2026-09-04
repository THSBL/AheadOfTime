import React, { useState } from 'react';
import { Cookie, X, Check, ShieldCheck } from 'lucide-react';
import { CookieConsentSettings } from '../types';

interface CookiePreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: CookieConsentSettings;
  onSavePreferences: (settings: CookieConsentSettings) => void;
}

export const CookiePreferencesModal: React.FC<CookiePreferencesModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSavePreferences,
}) => {
  const [functional, setFunctional] = useState<boolean>(true); // mandatory for session
  const [analytics, setAnalytics] = useState<boolean>(currentSettings.analytics);

  if (!isOpen) return null;

  const handleSave = () => {
    onSavePreferences({
      hasConsented: true,
      functional: true,
      analytics,
      timestamp: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Cookie &amp; Storage Preferences</h2>
              <p className="text-xs text-slate-300">Customize how data is stored on your device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-4 text-xs sm:text-sm">
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <span>Essential &amp; Functional Storage</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                  Required
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Utilized for local session persistence, remembering your onboarding calibration choices, and maintaining calendar link state.
              </p>
            </div>
            <div className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 bg-white flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <span>Performance &amp; Quality Analytics</span>
                <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-semibold">
                  Optional
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Anonymous metrics to help us measure latency during calendar scans and improve lead-time calculation models.
              </p>
            </div>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer mt-0.5"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
