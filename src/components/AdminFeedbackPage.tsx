import React, { useEffect, useState } from 'react';
import { CALENDAR_CHOICES, CALENDAR_CHOICE_LABELS } from '../utils/calendarPoll';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, Star } from 'lucide-react';
import { usePageMeta } from '../utils/usePageMeta';
import { getStoredAccessToken } from '../services/googleAuth';

interface FeedbackRow {
  id: string;
  createdAt: string;
  responseType: 'csat' | 'general_feedback';
  score: number | null;
  feedbackText: string | null;
  tags: string[];
  sourceChannel: string;
  userEmail: string;
}

// Not linked from anywhere in the app's nav - the real access control is
// server-side (ADMIN_EMAILS check on /api/feedback/admin-list, see
// server/googleAuthVerify.ts's isAdminEmail), not "nobody knows the URL."
// Reach it by navigating here directly while signed in with an admin
// Google account.
interface CalendarPollSummary {
  bySource: Record<string, Record<string, number>>;
  totalByCalendar: Record<string, number>;
  notifyByCalendar: Record<string, number>;
  recentOther: string[];
}

// "Which calendar do you use?" results (landing page, onboarding, feedback).
// Totals count each visitor once (their latest answer anywhere).
const CalendarPollResults: React.FC<{ summary: CalendarPollSummary }> = ({ summary }) => {
  const total = CALENDAR_CHOICES.reduce((n, c) => n + (summary.totalByCalendar[c] || 0), 0);
  const sources = ['landing', 'onboarding', 'feedback'];
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-extrabold text-slate-900">Which calendar do you use?</h2>
        <span className="text-xs text-slate-500">{total} {total === 1 ? 'person' : 'people'}</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-slate-500">No answers yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="font-semibold py-1 pr-3">Calendar</th>
                <th className="font-semibold py-1 pr-3 text-right">People</th>
                <th className="font-semibold py-1 pr-3 text-right">Share</th>
                {sources.map((s) => (
                  <th key={s} className="font-semibold py-1 pr-3 text-right capitalize">{s}</th>
                ))}
                <th className="font-semibold py-1 text-right">Left email</th>
              </tr>
            </thead>
            <tbody>
              {CALENDAR_CHOICES.map((c) => {
                const n = summary.totalByCalendar[c] || 0;
                return (
                  <tr key={c} className="border-t border-slate-100 text-slate-800">
                    <td className="py-1.5 pr-3 font-semibold">{CALENDAR_CHOICE_LABELS[c]}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{n}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{total ? Math.round((n / total) * 100) : 0}%</td>
                    {sources.map((s) => (
                      <td key={s} className="py-1.5 pr-3 text-right font-mono text-slate-500">{summary.bySource[s]?.[c] || 0}</td>
                    ))}
                    <td className="py-1.5 text-right font-mono text-slate-500">{c === 'google' ? '–' : summary.notifyByCalendar[c] || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {summary.recentOther.length > 0 && (
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">"Something else" answers:</span> {summary.recentOther.join(' · ')}
        </p>
      )}
    </section>
  );
};

export const AdminFeedbackPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta('Feedback Inbox - Ahead Of Time', 'Admin-only view of submitted feedback.');

  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [calendarPoll, setCalendarPoll] = useState<CalendarPollSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = getStoredAccessToken();
        const res = await fetch('/api/feedback/admin-list', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(res.status === 403 ? 'Not authorized for this account.' : res.status === 401 ? 'Please sign in with Google first.' : (data.error || 'Failed to load feedback.'));
          return;
        }
        setRows(data.rows);
        setCalendarPoll(data.calendarPoll || null);
      } catch (err: any) {
        setError(err?.message || 'Network error.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const downloadCsv = () => {
    if (!rows || rows.length === 0) return;
    const header = ['created_at', 'user_email', 'response_type', 'score', 'feedback_text', 'tags', 'source_channel'];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.createdAt,
          r.userEmail,
          r.responseType,
          r.score ?? '',
          r.feedbackText || '',
          r.tags.join('; '),
          r.sourceChannel,
        ]
          .map((v) => escape(String(v)))
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aot-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-xl transition font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
          {rows && rows.length > 0 && (
            <button
              type="button"
              onClick={downloadCsv}
              className="flex items-center gap-1.5 text-xs text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-xl transition font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full space-y-4">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Feedback Inbox</h1>

        {calendarPoll && <CalendarPollResults summary={calendarPoll} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-semibold">
            {error}
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-6 bg-white border border-slate-200 rounded-2xl text-sm text-slate-500 text-center">
            No feedback submitted yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{r.userEmail}</span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{r.sourceChannel}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                {r.responseType === 'csat' && typeof r.score === 'number' && (
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`w-3.5 h-3.5 ${n <= r.score! ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    ))}
                  </div>
                )}
                {r.feedbackText && <p className="text-xs text-slate-700 leading-relaxed">{r.feedbackText}</p>}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <span key={t} className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
