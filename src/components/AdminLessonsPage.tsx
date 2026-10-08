import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { usePageMeta } from '../utils/usePageMeta';
import { aiJsonHeaders } from '../services/aiRequest';

/**
 * /admin/lessons - plan lessons (server/planLessons.ts, server/lessonsStore.ts):
 * rules proposed from what users told us, waiting for the owner. Approve
 * (after editing if needed), reject, or retire a rule that's in use. The
 * server checks every field again; this page only edits.
 */

interface Lesson {
  id: string;
  category: string;
  action: 'add' | 'drop' | 'move';
  stepTitle: string;
  match: string[];
  daysBefore: number | null;
  eventWords: string[];
  why: string;
  support: number;
  examples: string[];
  status: 'proposed' | 'approved' | 'rejected' | 'retired';
  appliedCount: number;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  birthday_party: 'Birthday parties',
  hosting_visitors: 'Hosting visitors',
  friends_family: 'Friends & family',
  hobbies: 'Hobbies',
  festival_concert: 'Festivals & concerts',
  travel_trip: 'Trips',
  dinner_social: 'Dinners & nights out',
  project_deadline: 'Work deadlines',
  booking_trip: 'Bookings',
  subscription: 'Subscriptions',
  maintenance: 'Home & maintenance',
  kids_school: 'Kids: school',
  kids_hobbies: 'Kids: activities',
  custom: 'Other',
};

const when = (days: number | null) => (days === null ? '' : days === 0 ? 'on the day' : days > 0 ? `${days} day${days === 1 ? '' : 's'} before` : `${-days} day${days === -1 ? '' : 's'} after`);

function describe(l: Pick<Lesson, 'action' | 'stepTitle' | 'daysBefore'>): string {
  if (l.action === 'add') return `Add "${l.stepTitle}", ${when(l.daysBefore)}`;
  if (l.action === 'drop') return `Leave out "${l.stepTitle}"`;
  return `Move "${l.stepTitle}" to ${when(l.daysBefore)}`;
}

const LessonCard: React.FC<{ lesson: Lesson; categories: string[]; onDone: () => void }> = ({ lesson, categories, onDone }) => {
  const [draft, setDraft] = useState({ category: lesson.category, stepTitle: lesson.stepTitle, daysBefore: lesson.daysBefore, match: lesson.match.join(' '), eventWords: lesson.eventWords.join(' ') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (op: 'approve' | 'reject' | 'retire') => {
    setBusy(true);
    setError(null);
    try {
      const body = op === 'approve' ? { op, id: lesson.id, category: draft.category, stepTitle: draft.stepTitle, daysBefore: draft.daysBefore, match: draft.match, eventWords: draft.eventWords } : { op, id: lesson.id };
      const res = await fetch('/api/cron/lessons-admin', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'That did not work.');
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const proposed = lesson.status === 'proposed';
  return (
    <li className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 font-bold text-slate-700">{CATEGORY_LABELS[lesson.category] || lesson.category}</span>
        {lesson.eventWords.length > 0 && <span className="text-slate-500">only when the title mentions {lesson.eventWords.join(' / ')}</span>}
        {lesson.support > 0 && <span className="text-slate-500">from {lesson.support} people</span>}
        {lesson.status === 'approved' && <span className="text-emerald-700 font-semibold">in use · applied to {lesson.appliedCount} plan{lesson.appliedCount === 1 ? '' : 's'}</span>}
      </div>
      <p className="font-bold text-[#182A42]">{describe(lesson)}</p>
      {lesson.why && <p className="text-sm text-slate-600">{lesson.why}</p>}
      {lesson.examples.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold">What users said</summary>
          <ul className="mt-1.5 space-y-1 list-disc pl-4">
            {lesson.examples.map((ex, i) => (
              <li key={i}>{ex}</li>
            ))}
          </ul>
        </details>
      )}
      {proposed && (
        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <label className="font-semibold text-slate-700 sm:col-span-2">
            Step title
            <input value={draft.stepTitle} maxLength={60} onChange={(e) => setDraft({ ...draft, stepTitle: e.target.value })} className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5" />
          </label>
          <label className="font-semibold text-slate-700">
            Kind of event
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </label>
          <label className="font-semibold text-slate-700 sm:col-span-2">
            Only for events whose title mentions (words; required for Other)
            <input value={draft.eventWords} onChange={(e) => setDraft({ ...draft, eventWords: e.target.value })} placeholder="e.g. move moving" className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5" />
          </label>
          {lesson.action !== 'drop' && (
            <label className="font-semibold text-slate-700">
              Days before the event (negative = after)
              <input type="number" min={-60} max={365} value={draft.daysBefore ?? ''} onChange={(e) => setDraft({ ...draft, daysBefore: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </label>
          )}
          {lesson.action !== 'add' && (
            <label className="font-semibold text-slate-700">
              Matches steps containing (words)
              <input value={draft.match} onChange={(e) => setDraft({ ...draft, match: e.target.value })} className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </label>
          )}
        </div>
      )}
      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {proposed && (
          <>
            <button type="button" disabled={busy} onClick={() => act('approve')} className="px-3 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button type="button" disabled={busy} onClick={() => act('reject')} className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </>
        )}
        {lesson.status === 'approved' && (
          <button type="button" disabled={busy} onClick={() => act('retire')} className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer disabled:opacity-60">
            Stop using
          </button>
        )}
      </div>
    </li>
  );
};

export const AdminLessonsPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta('Plan lessons - Admin - Ahead Of Time', 'Admin-only review of plan lessons.');
  const [data, setData] = useState<{ lessons: Lesson[]; lastRun: { week: string; signals: number; proposed: number } | null; ai: boolean; categories: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/lessons-admin', { headers: aiJsonHeaders(), cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(res.status === 403 ? 'This account is not an admin.' : res.status === 401 ? 'Please sign in first.' : body?.error || 'Could not load.');
        return;
      }
      setError(null);
      setData(body);
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    setNote(null);
    try {
      const res = await fetch('/api/cron/lessons-admin', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify({ op: 'run' }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || 'That did not work.');
      setNote(body.summary);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const groups = data
    ? {
        proposed: data.lessons.filter((l) => l.status === 'proposed'),
        approved: data.lessons.filter((l) => l.status === 'approved'),
        past: data.lessons.filter((l) => l.status === 'rejected' || l.status === 'retired'),
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <button type="button" onClick={() => navigate('/admin/feedback')} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Feedback inbox
        </button>
        <div>
          <h1 className="text-2xl font-black text-[#182A42]">Plan lessons</h1>
          <p className="text-sm text-slate-600 mt-1">
            Once a week, what users told us (feedback, corrections in the chat, steps many people skip, blog notes) is turned into proposed rules
            for one kind of event. A rule only adds, leaves out or moves one step, and only after you approve it. Rules are applied by the app's
            code to new plans, never sent to the AI, so they can't change how it behaves.
          </p>
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {data?.lastRun ? `Last look: ${data.lastRun.week}, ${data.lastRun.signals} signals, ${data.lastRun.proposed} proposed.` : 'No proposals yet: the first look runs with the next daily job.'}
            {note ? ` ${note}.` : ''}
          </p>
          <button type="button" onClick={runNow} disabled={running || !data?.ai} className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Look for new lessons now
          </button>
        </section>

        {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
        {!data && !error && (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        )}

        {groups && (
          <>
            <h2 className="text-sm font-black text-slate-900">Waiting for you ({groups.proposed.length})</h2>
            {groups.proposed.length === 0 ? <p className="text-sm text-slate-500">Nothing to review.</p> : <ul className="space-y-3">{groups.proposed.map((l) => <LessonCard key={l.id} lesson={l} categories={data!.categories} onDone={load} />)}</ul>}
            <h2 className="text-sm font-black text-slate-900">In use ({groups.approved.length})</h2>
            {groups.approved.length === 0 ? <p className="text-sm text-slate-500">No rules in use yet.</p> : <ul className="space-y-3">{groups.approved.map((l) => <LessonCard key={l.id} lesson={l} categories={data!.categories} onDone={load} />)}</ul>}
            {groups.past.length > 0 && (
              <details>
                <summary className="text-sm font-black text-slate-900 cursor-pointer">Rejected and stopped ({groups.past.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {groups.past.map((l) => (
                    <li key={l.id}>
                      {CATEGORY_LABELS[l.category] || l.category}: {describe(l)} ({l.status})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
};
