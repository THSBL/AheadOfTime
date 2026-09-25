import { canUseAppSession, bearerHeader } from '../services/appSession';
import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';

interface AgendaFinding {
  id: string;
  title: string;
  eventDate: string;
  prepSteps: number;
}

interface AgendaFindingsBannerProps {
  onReview: () => void;
}

/**
 * The in-app fallback for the daily background scan: when new calendar
 * events were found but no Telegram/email message went out (the user has no
 * Telegram, or picked "notice in the app"), they show up here the next time
 * the app is open. Renders nothing when there is nothing to say - including
 * for users who never turned on Background Sync.
 */
export const AgendaFindingsBanner: React.FC<AgendaFindingsBannerProps> = ({ onReview }) => {
  const [findings, setFindings] = useState<AgendaFinding[]>([]);

  const load = useCallback(async () => {
    const stored = getStoredAccessToken();
    const token = stored && !isTokenExpired() ? stored : null;
    if (!token && !(await canUseAppSession())) return;
    try {
      const res = await fetch('/api/auth/google/findings', { headers: bearerHeader(token) });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.findings)) setFindings(data.findings);
    } catch {
      // A missing/unavailable backend just means no banner - never an error state.
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const dismiss = useCallback(async () => {
    setFindings([]);
    const stored = getStoredAccessToken();
    const token = stored && !isTokenExpired() ? stored : null;
    if (!token && !(await canUseAppSession())) return;
    try {
      await fetch('/api/auth/google/findings', { method: 'POST', headers: bearerHeader(token) });
    } catch {
      // Worst case the notice reappears next time.
    }
  }, []);

  if (findings.length === 0) return null;

  const titles = findings.slice(0, 3).map((f) => f.title);
  const extra = findings.length - titles.length;
  const summary = `${titles.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`;

  return (
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-5 pt-3 relative z-10">
      <div
        role="status"
        className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-white/95 border border-white/60 shadow-sm px-4 py-3"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-aot-sage/30 text-[#182A42] flex items-center justify-center shrink-0">
            <CalendarPlus className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#182A42]">
              {findings.length === 1 ? 'A new event on your calendar could use prep' : `${findings.length} new events on your calendar could use prep`}
            </p>
            <p className="text-xs text-slate-600 truncate">{summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onReview();
              void dismiss();
            }}
            className="px-3.5 py-2 rounded-xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-xs font-bold transition-all cursor-pointer"
          >
            Review &amp; build plans
          </button>
          <button
            type="button"
            onClick={() => void dismiss()}
            aria-label="Dismiss"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
