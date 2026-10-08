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

  // One plain line: it used to take a third of a phone screen with a
  // heading and jargon, right over the try-out's first screen.
  return (
    <div
      id="cookie-consent-banner"
      className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-40 max-w-2xl mx-auto animate-in slide-in-from-bottom duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center gap-3">
        <Cookie className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-[12px] sm:text-xs text-slate-300 leading-snug">
          We keep your plans and settings on this device, and use analytics to improve the app.
        </p>
        <button
          onClick={onOpenPreferences}
          className="shrink-0 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
        <button
          onClick={handleAcceptAll}
          className="shrink-0 px-3.5 py-1.5 rounded-lg bg-[#95BFB5] hover:bg-[#a9cdc4] text-[#182A42] text-xs font-bold flex items-center gap-1 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>OK</span>
        </button>
      </div>
    </div>
  );
};
