import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, Copy, Info, Loader2, Share2, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { activeSteps, fixedMoments, outlookSubscribeLink, shortDay, webcalUrl, type ReminderPrefs } from '../utils/planLink';
import { getReminderPrefs, pushPlanToGoogle, setPendingPush, setReminderPrefs } from '../services/pushPlan';
import { describePlanSync, planSyncPending, planSyncStatus } from '../utils/googleSyncPlan';
import { savePlanFeed } from '../services/planLink';
import { isAuthErrorMessage, clearGoogleSession } from '../services/googleAuth';
import { ReminderStyleCards } from './ReminderStyleCards';
import { FollowHelp } from './FollowHelp';
import { openSignIn } from './SignInModal';
import { trackEvent } from '../services/analytics';
import { getCurrentUser } from '../services/accountManager';

/**
 * "Add to your calendar" for ONE plan (the chat's plan card, the plan's
 * Sync button, the try-out). The app decides what is an event - the day
 * itself, a trip's departure and return; the owner only picks how prep
 * tasks show: as tasks, or as reminders at a time and length they choose.
 * Google: pushed into the main calendar (sign-in once). Apple, Outlook and
 * the rest: a subscription to just this plan, no account needed, that
 * follows the owner's changes (server/sharedPlans.ts feed).
 */

type CalendarApp = 'google' | 'apple' | 'outlook' | 'other';
const APPS: Array<{ id: CalendarApp; label: string }> = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'other', label: 'Other' },
];

const LAST_APP = 'aot_last_calendar_app';

function initialApp(): CalendarApp {
  try {
    const saved = localStorage.getItem(LAST_APP) as CalendarApp | null;
    if (saved && APPS.some((a) => a.id === saved)) return saved;
  } catch {
    // no saved choice
  }
  return /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'apple' : 'google';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface PushPlanSheetProps {
  event: CalendarEvent;
  onClose: () => void;
  onUpdateEvent?: (updated: CalendarEvent) => void;
  /** "Now tell the family": opens the share window for this plan. */
  onShare?: () => void;
}

export const PushPlanSheet: React.FC<PushPlanSheetProps> = ({ event, onClose, onUpdateEvent, onShare }) => {
  // Signed in: Google can be pushed right away.
  const isSignedIn = Boolean(getCurrentUser());
  const [app, setApp] = useState<CalendarApp>(initialApp);
  const [prefs, setPrefs] = useState<ReminderPrefs>(getReminderPrefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { app: CalendarApp; link?: string; added?: number; updated?: number; removed?: number; wasUpdate?: boolean }>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const steps = useMemo(() => activeSteps(event), [event]);
  const moments = useMemo(() => fixedMoments(event), [event]);
  const today = new Date().toISOString().slice(0, 10);
  const sampleStep = steps.find((s) => s.status !== 'completed' && s.calculatedDate.slice(0, 10) >= today) || steps[0];
  const sample = { title: sampleStep?.title || 'Your next step', date: sampleStep?.calculatedDate.slice(0, 10) || event.eventDate };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    trackEvent('push_sheet_open');
  }, []);

  const choose = (next: CalendarApp) => {
    setApp(next);
    setError(null);
    setFeedUrl(null);
    try {
      localStorage.setItem(LAST_APP, next);
    } catch {
      // not remembered
    }
  };

  const changePrefs = (next: ReminderPrefs) => {
    setPrefs(next);
    setReminderPrefs(next);
    setFeedUrl(null);
  };

  const momentText = moments.map((m) => `${shortDay(m.date)}${m.time ? ` ${m.time}` : ''}, ${m.title}`).join(' and ');
  const summary =
    prefs.style === 'tasks'
      ? `${plural(steps.length, 'task', 'tasks')} + ${plural(moments.length, 'event', 'events')}`
      : plural(steps.length + moments.length, 'event', 'events');
  // Already in Google: this is an update - say what changes, not the whole plan again.
  const syncStatus = planSyncStatus(
    event,
    prefs.style === 'events' ? { format: 'timed', time: prefs.time, minutes: prefs.minutes } : { format: 'tasks_only' }
  );
  const isUpdate = syncStatus.pushedBefore && !syncStatus.eventMissing;
  const changeCount = planSyncPending(syncStatus);

  const pushGoogle = async () => {
    if (!isSignedIn) {
      setPendingPush(event.id);
      openSignIn('Continue with Google to put this plan in your Google Calendar. Your plan comes with you.');
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await pushPlanToGoogle(event, prefs);
      if (result.updatedEvent) onUpdateEvent?.(result.updatedEvent);
      if (result.error && !result.updatedEvent?.googleEventId) throw new Error(result.error);
      trackEvent(isUpdate ? 'plan_sync_updated' : 'plan_pushed', { app: 'google', style: prefs.style });
      setDone({
        app: 'google',
        link: result.mainEventLink,
        added: result.newItemsCount,
        updated: result.updatedItemsCount || 0,
        removed: result.removedItemsCount || 0,
        wasUpdate: isUpdate,
      });
    } catch (err: any) {
      if (isAuthErrorMessage(err)) {
        clearGoogleSession();
        setError('Your Google sign-in expired. Tap again to sign in.');
      } else {
        setError(err?.message || 'That did not work. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  /** The subscription link for this plan (made on first use). */
  const ensureFeed = async (): Promise<string | null> => {
    if (feedUrl) return feedUrl;
    setBusy(true);
    setError(null);
    try {
      const data = await savePlanFeed(event, prefs);
      setFeedUrl(data.feedUrl);
      return data.feedUrl;
    } catch (err: any) {
      setError(err?.message || 'That did not work. Try again.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const subscribe = async () => {
    // Open the window now: after the wait, a browser may block it.
    const outlookWindow = app === 'outlook' ? window.open('', '_blank') : null;
    const url = await ensureFeed();
    if (!url) {
      outlookWindow?.close();
      return;
    }
    trackEvent('plan_pushed', { app, style: prefs.style });
    if (app === 'apple') {
      window.location.href = webcalUrl(url);
    } else if (app === 'outlook') {
      const outlook = outlookSubscribeLink(url, event.title);
      if (outlookWindow) outlookWindow.location.href = outlook;
      else window.open(outlook, '_blank');
    }
    setDone({ app });
  };

  const copyFeed = async () => {
    const url = await ensureFeed();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard: the link is on screen, selectable.
      try {
        window.prompt('Copy this link', url);
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const chips = ['No account needed', 'Only this plan is added', 'Plan updates by itself (when changed by owner)'];

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-plan-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 text-slate-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="push-plan-title" className="text-lg font-black text-[#182A42]">
            {done ? (done.wasUpdate ? 'Calendar updated' : 'In your calendar') : isUpdate && app === 'google' ? 'Update your calendar' : 'Add to your calendar'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-aot-green-200 p-4 space-y-3">
              <CheckCircle2 className="w-10 h-10 text-[#447463]" />
              <p className="text-sm text-slate-700">
                <b>{event.title}</b>, and only that.
              </p>
              {done.app === 'google' && done.wasUpdate ? (
                <ul className="text-sm space-y-1.5">
                  {[
                    done.added ? `${done.added} added` : '',
                    done.updated ? `${done.updated} updated with the new details` : '',
                    done.removed ? `${done.removed} no longer in the plan, removed` : '',
                  ]
                    .filter(Boolean)
                    .map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  {!done.added && !done.updated && !done.removed && <li>Everything was already up to date.</li>}
                </ul>
              ) : done.app === 'google' ? (
                <ul className="text-sm space-y-1.5">
                  <li>
                    <b>{prefs.style === 'tasks' ? plural(steps.length, 'task', 'tasks') : plural(steps.length, 'reminder', 'reminders')}</b>{' '}
                    {prefs.style === 'tasks' ? 'in Google Tasks' : `in your calendar at ${prefs.time}`}
                  </li>
                  <li>
                    <b>{plural(moments.length, 'event', 'events')}</b> in your main calendar: {moments.map((m) => m.key === 'event' ? 'the day itself' : m.key === 'departure' ? 'departure' : 'return').join(' and ')}
                  </li>
                </ul>
              ) : (
                <>
                  <p className="text-sm text-slate-700">Your calendar app takes it from here: say yes when it asks to subscribe.</p>
                  {(done.app === 'apple' || done.app === 'outlook') && <FollowHelp app={done.app} title={event.title} />}
                </>
              )}
              <p className="text-xs text-slate-500">
                {done.app === 'google' ? 'Change the plan again later? Press Update & sync plan and your calendar follows.' : 'Change the plan here and your calendar follows by itself.'}
              </p>
              {done.app === 'google' && (
                <a href={done.link || 'https://calendar.google.com'} target="_blank" rel="noreferrer" className="flex items-center justify-center min-h-11 rounded-xl border border-[#182A42] text-[#182A42] text-sm font-extrabold">
                  Open Google Calendar
                </a>
              )}
            </div>
            {onShare && (
              <div className="rounded-2xl bg-[#182A42] text-white p-4 space-y-2.5">
                <p className="text-base font-black">Now tell the family</p>
                <p className="text-sm text-slate-300">Send a link in the family chat. They see the date and their part, and add it to their own calendar in one tap.</p>
                <button
                  type="button"
                  onClick={onShare}
                  className="w-full min-h-12 rounded-xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" /> Share with family
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div role="group" aria-label="Your calendar" className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl">
              {APPS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={app === a.id}
                  onClick={() => choose(a.id)}
                  className={`min-h-10 rounded-lg text-xs cursor-pointer ${app === a.id ? 'bg-[#182A42] text-white font-extrabold' : 'text-slate-700 font-bold hover:bg-white'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-black">Show your {plural(steps.length, 'prep task', 'prep tasks')} as…</h3>
              <p className="text-xs text-slate-600 mt-0.5">{event.title} · {shortDay(event.eventDate)}</p>
            </div>

            <ReminderStyleCards prefs={prefs} onChange={changePrefs} sample={sample} />

            {moments.length > 0 && (
              <p className="text-xs text-slate-700 flex gap-2 border-t border-slate-200 pt-3 leading-relaxed">
                <Info className="w-4 h-4 text-[#447463] shrink-0 mt-px" />
                <span>
                  Fixed moments always go in as events, at their own time: <b>{momentText}</b>.
                </span>
              </p>
            )}

            {app === 'google' ? (
              <div className="space-y-2 pt-1">
                {isUpdate ? (
                  <p className="text-xs text-slate-700 text-center">
                    {changeCount > 0 || syncStatus.legacyCleanup ? (
                      <>
                        Since your last sync: <b>{describePlanSync(syncStatus)}</b>
                      </>
                    ) : (
                      <>Your calendar has this plan. Sync again to refresh every step.</>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-slate-700 text-center">
                    <b>{summary}</b> in your main Google Calendar
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || steps.length + moments.length === 0}
                  onClick={pushGoogle}
                  className="w-full min-h-12 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} {!isSignedIn ? 'Continue with Google' : isUpdate ? 'Update & sync plan' : 'Add to Google Calendar'}
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  {isUpdate ? 'Changed steps are updated in place; steps you removed come out of your calendar.' : 'Only this plan is added. Your plan comes with you when you sign in.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <ul className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-3">
                  {chips.map((c) => (
                    <li key={c} className="flex items-center gap-1 bg-aot-green-50 text-aot-green-800 text-xs font-bold px-2.5 py-1.5 rounded-full">
                      <Check className="w-3.5 h-3.5 text-[#447463]" /> {c}
                    </li>
                  ))}
                </ul>
                {app === 'other' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-700">Add this link to your calendar app as a subscription ("add calendar from URL").</p>
                    {feedUrl && <div className="font-mono text-[11px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 break-all select-all">{feedUrl}</div>}
                    <button type="button" disabled={busy} onClick={copyFeed} className="w-full min-h-12 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy the calendar link'}
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" disabled={busy} onClick={subscribe} className="w-full min-h-12 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />} {app === 'apple' ? 'Subscribe in Apple Calendar' : 'Subscribe in Outlook'}
                    </button>
                    <button type="button" disabled={busy} onClick={copyFeed} className="w-full min-h-11 text-xs font-bold text-[#182A42] cursor-pointer">
                      {copied ? 'Copied' : 'On a computer? Copy the link instead'}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    </div>,
    document.body
  );
};
