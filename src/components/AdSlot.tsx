import React, { useEffect, useRef } from 'react';

/**
 * One Google AdSense block - only on public pages (a shared plan, the
 * try-out chat), never next to anyone's calendar data. Non-personalised
 * ads only, matching the privacy policy. Shows nothing until the slot's
 * ad unit id is set (VITE_ADSENSE_SLOT_*; the publisher id is below). Those
 * pages' Content-Security-Policy allows Google's ad domains (vercel.json);
 * everywhere else it stays strict, so an ad can't load there.
 */

/** The site's AdSense publisher id (public; VITE_ADSENSE_CLIENT can override it). */
export const ADSENSE_CLIENT_DEFAULT = 'ca-pub-3080738656559449';
const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || ADSENSE_CLIENT_DEFAULT;
const SLOTS: Record<'sharedPlan' | 'tryChat', string> = {
  sharedPlan: (import.meta.env.VITE_ADSENSE_SLOT_SHARED_PLAN as string | undefined)?.trim() || '',
  tryChat: (import.meta.env.VITE_ADSENSE_SLOT_TRY_CHAT as string | undefined)?.trim() || '',
};

let scriptRequested = false;
function loadAdSense(): void {
  if (scriptRequested || !CLIENT) return;
  scriptRequested = true;
  const w = window as any;
  w.adsbygoogle = w.adsbygoogle || [];
  // Non-personalised: no profile-based ads (see the privacy policy).
  w.adsbygoogle.requestNonPersonalizedAds = 1;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

export const isAdsConfigured = (place: keyof typeof SLOTS) => Boolean(CLIENT && SLOTS[place]);

export const AdSlot: React.FC<{ place: keyof typeof SLOTS; className?: string }> = ({ place, className = '' }) => {
  const pushed = useRef(false);
  const slot = SLOTS[place];

  useEffect(() => {
    if (!CLIENT || !slot || pushed.current) return;
    pushed.current = true;
    loadAdSense();
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // blocked by an ad blocker or the page's policy: show nothing
    }
  }, [slot]);

  if (!CLIENT || !slot) return null;
  return (
    <aside className={`w-full ${className}`} aria-label="Advertisement">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 text-center">Advertisement</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 90 }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
};
