import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, PenLine, Sparkles } from 'lucide-react';
import { usePageMeta } from '../utils/usePageMeta';
import { aiJsonHeaders } from '../services/aiRequest';

/**
 * /admin/blog - every "T-minus Talks" conversation (server/blogEpisodes.ts)
 * in one place: what's being written, what waits for you, what's live.
 * "Edit" opens the review page (note, name, Publish / Skip / Unpublish).
 * Admins only: the list and the writing run check ADMIN_EMAILS server-side.
 */

interface Row {
  id: number;
  week: string;
  status: 'drafting' | 'review' | 'published' | 'skipped' | 'failed';
  title: string | null;
  guest: string;
  step: string | null;
  lastError: string | null;
  createdAt: string;
  publishedAt: string | null;
  url: string | null;
  reviewUrl: string | null;
}

const STATUS: Record<Row['status'], { label: string; className: string }> = {
  drafting: { label: 'Being written', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  review: { label: 'Waiting for you', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  published: { label: 'Live', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  skipped: { label: 'Skipped', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** One writing run is about 50 seconds; a whole conversation takes a few. */
const MAX_RUNS = 8;

export const AdminBlogPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta('Blog - Admin - Ahead Of Time', 'Admin-only overview of the blog conversations.');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [setup, setSetup] = useState<{ ai: boolean; reviewLinks: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/blog-admin', { headers: aiJsonHeaders(), cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(res.status === 403 ? 'This account is not an admin.' : res.status === 401 ? 'Please sign in first.' : data?.error || 'Could not load the blog.');
        return;
      }
      setError(null);
      setRows(data.episodes);
      setSetup(data.setup);
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const drafting = rows?.find((r) => r.status === 'drafting');

  // Runs until the conversation is ready for review (or something stops it).
  const write = async () => {
    setError(null);
    let startNew = !drafting;
    for (let i = 0; i < MAX_RUNS; i++) {
      setWriting(i === 0 ? 'Starting…' : 'Still writing…');
      try {
        const res = await fetch('/api/cron/blog-admin', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify({ startNew }) });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'The run did not finish.');
        startNew = false;
        const run = data.run as { status: string; step?: string; reviewUrl?: string };
        await load();
        if (run.status === 'drafting') {
          setWriting(`Writing: ${run.step || 'working'}…`);
          continue;
        }
        if (run.status !== 'ready for review') setError(run.status);
        break;
      } catch (e: any) {
        setError(e?.message || 'Network error.');
        break;
      }
    }
    setWriting(null);
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/admin/feedback')} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Feedback inbox
          </button>
          <a href="/blog" target="_blank" rel="noopener" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
            Public blog <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div>
          <h1 className="text-2xl font-black text-[#182A42]">T-minus Talks</h1>
          <p className="text-sm text-slate-600 mt-1">
            One conversation a week. A new one starts by itself every week; you get an email and a Telegram message when it's ready. Open
            <b> Edit</b> to read it, add your note and publish or skip.
          </p>
        </div>

        {setup && (!setup.ai || !setup.reviewLinks) && (
          <p className="text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3">
            {!setup.ai ? 'GEMINI_API_KEY is not set, so no conversations can be written. ' : ''}
            {!setup.reviewLinks ? 'NOTIFY_LINK_SECRET is not set, so there are no Edit links.' : ''}
          </p>
        )}

        <section className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-bold text-slate-900">{drafting ? `${drafting.week} is being written` : 'Want one now?'}</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {writing || (drafting ? `At: ${drafting.step}. It carries on by itself tomorrow, or now with the button.` : 'Takes 1-4 minutes. Keep this page open.')}
            </p>
          </div>
          <button
            type="button"
            onClick={write}
            disabled={Boolean(writing) || !setup?.ai}
            className="px-4 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-default"
          >
            {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {drafting ? 'Continue writing' : 'Write a new one now'}
          </button>
        </section>

        {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

        {!rows && !error && (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        )}

        {rows && rows.length === 0 && <p className="text-sm text-slate-500">No conversations yet. The first one starts with the next daily run, or use the button above.</p>}

        {rows && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full border font-bold ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                  <span className="text-slate-500">
                    {r.week} · {r.publishedAt ? `live since ${day(r.publishedAt)}` : `started ${day(r.createdAt)}`}
                  </span>
                </div>
                <p className="font-bold text-[#182A42] leading-snug">{r.title || (r.status === 'drafting' ? `Writing: ${r.step}` : 'No post was written')}</p>
                <p className="text-xs text-slate-500">Guest: {r.guest} (AI persona)</p>
                {r.lastError && r.status !== 'published' && <p className="text-xs text-rose-700">Last problem: {r.lastError}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.reviewUrl && (
                    <a href={r.reviewUrl} className="px-3 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5">
                      <PenLine className="w-3.5 h-3.5" /> Edit
                    </a>
                  )}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener" className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5">
                      View live <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
