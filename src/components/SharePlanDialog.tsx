import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link2, Loader2, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { aiJsonHeaders } from '../services/aiRequest';
import { trackEvent } from '../services/analytics';
import { openSignIn } from './SignInModal';

/**
 * Share a plan as a read-only link (server/sharedPlans.ts). Says exactly
 * what the link shows - the plan's steps, dates and ideas, nothing else -
 * and can be switched off again. Sharing again refreshes what it shows.
 */
export const SharePlanDialog: React.FC<{ event: CalendarEvent; onClose: () => void }> = ({ event, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    fetch(`/api/plan/shared?eventKey=${encodeURIComponent(event.id)}`, { headers: aiJsonHeaders(), cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) return setNeedsSignIn(true);
        const data = await r.json().catch(() => null);
        if (data?.ok) setUrl(data.url);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => window.removeEventListener('keydown', onKey);
  }, [event.id, onClose]);

  const act = async (action: 'share' | 'stop') => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/plan/shared', {
        method: 'POST',
        headers: aiJsonHeaders(),
        body: JSON.stringify(action === 'share' ? { action, eventKey: event.id, event } : { action, eventKey: event.id }),
      });
      if (r.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) throw new Error(data?.error || 'That did not work. Try again.');
      setUrl(data.url);
      trackEvent(action === 'share' ? 'plan_shared' : 'plan_share_stopped');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link', url);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  // On top of the whole page (the plan panel it's opened from clips its children).
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-plan-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 text-slate-800 space-y-4"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
        <div>
          <h2 id="share-plan-title" className="text-lg font-black text-[#182A42] flex items-center gap-2">
            <Link2 className="w-5 h-5" /> Share this plan
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Anyone with the link sees <b>{event.title}</b>: its steps, dates and ideas. Not your notes, your other plans or your account.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</p>
        ) : needsSignIn ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              openSignIn('Sign in to share your plan.');
            }}
            className="w-full py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold cursor-pointer"
          >
            Sign in to share
          </button>
        ) : url ? (
          <div className="space-y-2.5">
            <div className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 break-all select-all">{url}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className="flex-1 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" disabled={busy} onClick={() => act('share')} className="px-3 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold cursor-pointer disabled:opacity-50">
                Update
              </button>
            </div>
            <p className="text-[11px] text-slate-500">The link shows the plan as it was when you shared it. Changed something? Tap Update.</p>
            <button type="button" disabled={busy} onClick={() => act('stop')} className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer">
              Stop sharing
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('share')}
            className="w-full py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Create a link
          </button>
        )}
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    </div>,
    document.body
  );
};
