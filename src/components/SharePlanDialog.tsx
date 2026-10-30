import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Loader2, MessageCircle, Share2, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { activeSteps, defaultEveryoneStepIds, shareMessage, shortDay, type ShareAudience } from '../utils/planLink';
import { paintPlanPreview } from '../utils/planPreviewImage';
import {
  loadPlanLink,
  nextUpLine,
  planDateLine,
  reminderCountForPeople,
  rememberPlanLink,
  sharePlanWithPeople,
  stopSharingPlan,
} from '../services/planLink';
import { trackEvent } from '../services/analytics';

/**
 * Share a plan with family and friends (server/sharedPlans.ts). Guests see
 * the day and the steps marked "Everyone"; a co-organiser sees the whole
 * plan. The link goes out with a short call to action, and the chat app
 * shows the plan's picture above it - drawn here exactly as it's sent.
 * No account needed, for the owner or the people they send it to; the
 * link follows the owner's changes and can be switched off again.
 */
export const SharePlanDialog: React.FC<{ event: CalendarEvent; onClose: () => void }> = ({ event, onClose }) => {
  const steps = useMemo(() => activeSteps(event), [event]);
  const [audience, setAudience] = useState<ShareAudience>('guests');
  const [everyone, setEveryone] = useState<string[]>(() => defaultEveryoneStepIds(event));
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The opener may pass a new function every render: only the plan decides when to load.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    loadPlanLink(event.id)
      .then((state) => {
        if (state.shared) {
          setUrl(state.url);
          rememberPlanLink(event, state);
        }
        if (state.settings) {
          setAudience(state.settings.audience);
          if (state.settings.everyone.length || state.shared) setEveryone(state.settings.everyone);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const settings = { audience, everyone };
  const reminders = reminderCountForPeople(event, settings);
  const nextUp = nextUpLine(event, settings);

  useEffect(() => {
    if (canvasRef.current) paintPlanPreview(canvasRef.current, { title: event.title, dateLine: planDateLine(event), nextUp });
  }, [event, nextUp]);

  const toggleStep = (id: string) => setEveryone((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  /** Creates the link, or brings it up to date with what's chosen here. */
  const ensureLink = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      const state = await sharePlanWithPeople(event, settings);
      setUrl(state.url);
      trackEvent('plan_shared', { audience });
      return state.url;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsApp = async () => {
    // Opened now: after the wait, a browser may block a new window.
    const win = window.open('', '_blank');
    const link = await ensureLink();
    if (!link) {
      win?.close();
      return;
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(shareMessage(link, reminders))}`;
    if (win) win.location.href = wa;
    else window.location.href = wa;
    trackEvent('plan_share_whatsapp');
  };

  const copyLink = async () => {
    const link = await ensureLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // No clipboard: the link is on screen in the preview, selectable.
      try {
        window.prompt('Copy this link', link);
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const otherApps = async () => {
    const link = await ensureLink();
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareMessage(link, reminders).replace(link, '').trim(), url: link });
      } catch {
        // Closed the share sheet: nothing to do.
      }
    } else {
      await copyLink();
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      await stopSharingPlan(event.id);
      setUrl(null);
      trackEvent('plan_share_stopped');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cta =
    reminders <= 0
      ? 'Tap to add this event to your calendar:'
      : `Tap to add this event and ${reminders} more ${reminders === 1 ? 'reminder' : 'reminders'} to your calendar:`;

  // On top of the whole page (the plan panel it's opened from clips its children).
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-plan-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 text-slate-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="share-plan-title" className="text-lg font-black text-[#182A42]">Share with family</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div role="group" aria-label="What they see" className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
          {(['guests', 'all'] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={audience === a}
              onClick={() => setAudience(a)}
              className={`min-h-11 rounded-lg text-xs cursor-pointer ${audience === a ? 'bg-[#182A42] text-white font-extrabold' : 'text-slate-700 font-bold hover:bg-white'}`}
            >
              {a === 'guests' ? 'Guests: their part' : 'Co-organiser: all'}
            </button>
          ))}
        </div>

        {audience === 'guests' ? (
          <div>
            <h3 className="text-[13px] font-black mb-1">Guests see the day and these steps</h3>
            {steps.length === 0 ? (
              <p className="text-xs text-slate-500">This plan has no steps yet: guests see the day.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {steps.map((m) => {
                  const on = everyone.includes(m.id);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2 min-h-10 py-1">
                      <span className={`text-xs min-w-0 ${on ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                        {m.title}
                        {on && <span className="text-slate-500 font-semibold"> · {shortDay(m.calculatedDate)}</span>}
                      </span>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${m.title}: ${on ? 'everyone' : 'just me'}`}
                        onClick={() => toggleStep(m.id)}
                        className={`shrink-0 min-h-8 px-2.5 rounded-full text-[11px] border cursor-pointer ${
                          on ? 'font-extrabold border-[#447463] bg-aot-green-100 text-aot-green-800' : 'font-bold border-slate-300 bg-white text-slate-600'
                        }`}
                      >
                        {on ? 'Everyone' : 'Just me'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-600">A co-organiser sees every step, its date and its ideas. Not your notes, your other plans or your account.</p>
        )}

        <figure className="m-0 bg-[#efeae2] rounded-2xl p-2.5 space-y-1.5">
          <figcaption className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">How it looks in the family chat</figcaption>
          <div className="ml-auto w-[92%] bg-[#d9fdd3] rounded-xl rounded-tr-sm p-1 shadow-sm">
            <div className="bg-[#d1f4cc] rounded-lg overflow-hidden">
              <canvas ref={canvasRef} role="img" aria-label={`Preview picture: you are invited to ${event.title}${nextUp ? `, next up ${nextUp}` : ''}`} className="block w-full h-auto" />
              <p className="px-2 py-1 text-[11px] text-slate-600">
                <b className="text-slate-900">Shared plan · Ahead Of Time</b> · aheadoftime.app
              </p>
            </div>
            <div className="px-1.5 pt-1.5 pb-1 text-xs leading-snug text-slate-900 space-y-3">
              <p className="font-bold">{cta}</p>
              <p className="text-sky-700 break-all">{url || 'aheadoftime.app/p/…'}</p>
            </div>
          </div>
        </figure>

        {loading ? (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</p>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={sendWhatsApp}
              className="w-full min-h-12 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Send in WhatsApp
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={copyLink} className="min-h-11 rounded-xl border border-[#182A42] text-[#182A42] text-sm font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" disabled={busy} onClick={otherApps} className="min-h-11 rounded-xl border border-[#182A42] text-[#182A42] text-sm font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                <Share2 className="w-4 h-4" /> Other apps
              </button>
            </div>
            <p className="text-[11px] text-slate-500 text-center">No account needed, for you or them. Changes show up for everyone.</p>
            {url && (
              <button type="button" disabled={busy} onClick={stop} className="block mx-auto text-xs font-bold text-rose-600 hover:text-rose-700 min-h-9 cursor-pointer">
                Stop sharing
              </button>
            )}
          </div>
        )}
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    </div>,
    document.body
  );
};
