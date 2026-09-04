import React, { useState, useEffect } from 'react';
import { Cookie, Settings2, Check } from 'lucide-react';
import { CookieConsentSettings } from '../types';

interface CookieBannerProps {
  onOpenPreferences: () => void;
  onConsentAccepted: (settings: CookieConsentSettings) => void;
}

const STORAGE_KEY = 'has_cookie_consent_v1';

export const CookieBanner: React.FC<CookieBannerProps> = ({
  onOpenPreferences,
  onConsentAccepted,
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // Small delay for smooth entry
        const timer = setTimeout(() => setIsVisible(true), 400);
        return () => clearTimeout(timer);
      }
    } catch {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const settings: CookieConsentSettings = {
      hasConsented: true,
      functional: true,
      analytics: true,
      timestamp: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Could not persist cookie consent', e);
    }
    setIsVisible(false);
    onConsentAccepted(settings);
  };

  if (!isVisible) return null;

  return (
    <div
      id="cookie-consent-banner"
      className="fixed bottom-3 sm:bottom-4 left-3 sm:left-6 right-3 sm:right-6 z-40 max-w-4xl mx-auto animate-in slide-in-from-bottom duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
            <Cookie className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <span>Session Persistence &amp; Storage Notice</span>
            </h4>
            <p className="text-slate-300 text-[11px] sm:text-xs leading-relaxed max-w-2xl">
              We utilize functional cookies and client local storage to maintain session persistence, save your calibration preferences, and preserve calendar lead-time calculations across visits.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end pt-1 md:pt-0">
          <button
            onClick={onOpenPreferences}
            className="px-3.5 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Preferences</span>
          </button>

          <button
            onClick={handleAcceptAll}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-all shadow-sm hover:shadow flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Accept All</span>
          </button>
        </div>
      </div>
    </div>
  );
};
