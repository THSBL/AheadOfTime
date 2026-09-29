import React, { useEffect, useState } from 'react';
import { CalendarPlus, Copy, Check, RefreshCw } from 'lucide-react';
import { SettingsRow, SettingsPill } from './SettingsRow';
import { aiJsonHeaders } from '../services/aiRequest';
import { openSignIn } from './SignInModal';

interface FeedState {
  enabled: boolean;
  url: string | null;
}

/**
 * Settings → Connections: "Calendar feed" - a private link Apple Calendar,
 * Outlook or any other calendar can subscribe to. Every task shows up there
 * with a one-tap "Mark done" link (see server/calendarFeed.ts).
 */
export const CalendarFeedCard: React.FC = () => {
  const [state, setState] = useState<FeedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    fetch('/api/auth/calendar-feed', { headers: aiJsonHeaders(), cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) {
          setNeedsSignIn(true);
          return;
        }
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.ok) throw new Error(data?.error || 'Could not load the calendar feed.');
        setState({ enabled: data.enabled, url: data.url });
      })
      .catch((e) => setError(e.message));
  }, []);

  const act = async (action: 'enable' | 'reset' | 'disable') => {
    if (action === 'reset' && !window.confirm('Make a new link? Calendars using the old link stop updating until you subscribe again.')) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/calendar-feed', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify({ action }) });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) throw new Error(data?.error || 'That did not work. Try again.');
      setState({ enabled: data.enabled, url: data.url });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!state?.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', state.url);
    }
  };

  const webcal = state?.url ? state.url.replace(/^https?:\/\//, 'webcal://') : null;
  const enabled = Boolean(state?.enabled);

  return (
    <SettingsRow
      id="calendar-feed"
      icon={<CalendarPlus className="w-4 h-4" />}
      title="Calendar feed"
      subtitle="Your tasks in Apple, Outlook or any calendar"
      right={<SettingsPill on={enabled}>{enabled ? 'On' : 'Off'}</SettingsPill>}
      open={false}
    >
      <p>
        Subscribe once and your tasks appear in your own calendar. Each task has a <b>✓ Mark done</b> link: tap it and the task is done here
        too, no sign-in needed. Done in the app or Telegram? Your calendar shows it at its next refresh (usually within an hour).
      </p>
      {needsSignIn && (
        <button
          type="button"
          onClick={() => openSignIn('Sign in to turn on the calendar feed. No Google account? Use the email link.')}
          className="px-3.5 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
        >
          Sign in to use the calendar feed
        </button>
      )}
      {error && <p className="text-rose-600 font-semibold">{error}</p>}
      {state && !enabled && (
        <button
          type="button"
          disabled={busy}
          onClick={() => act('enable')}
          className="px-3.5 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
        >
          Turn on calendar feed
        </button>
      )}
      {enabled && state?.url && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <a
              href={webcal || undefined}
              className="px-3.5 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Subscribe in my calendar
            </a>
            <button
              type="button"
              onClick={copy}
              className="px-3.5 py-2 rounded-xl border border-[#182A42] text-[#182A42] hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <ul className="list-disc pl-4 space-y-1">
            <li><b>iPhone / Mac:</b> tap Subscribe, or in Calendar choose File → New Calendar Subscription and paste the link.</li>
            <li><b>Outlook:</b> Add calendar → Subscribe from web, paste the link.</li>
            <li><b>Google Calendar:</b> Other calendars → From URL, paste the link.</li>
          </ul>
          <p className="text-slate-500">Keep this link private: anyone with it can see your tasks and mark them done.</p>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => act('reset')} className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
              <RefreshCw className="w-3 h-3" /> New link
            </button>
            <button type="button" disabled={busy} onClick={() => act('disable')} className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer">
              Turn off
            </button>
          </div>
        </div>
      )}
    </SettingsRow>
  );
};
