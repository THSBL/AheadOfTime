import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Undo2, Loader2 } from 'lucide-react';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { fetchDeletedEvents, restoreDeletedEvent, type DeletedEventSummary } from '../services/eventSync';

// Kept in step with PURGE_AFTER_DAYS in server/eventSyncSchema.ts.
const RETENTION_DAYS = 30;

function daysLeft(deletedAtIso: string): number {
  const elapsed = (Date.now() - Date.parse(deletedAtIso)) / 86_400_000;
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
}

/**
 * Undo for accidental deletes: events are only marked deleted on the server,
 * kept for RETENTION_DAYS, then purged. Restoring brings the event (with its
 * tasks) back on every device.
 */
export const RecentlyDeletedEventsCard: React.FC = () => {
  const [items, setItems] = useState<DeletedEventSummary[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token || isTokenExpired()) {
      setItems([]);
      return;
    }
    setItems(await fetchDeletedEvents(token));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (item: DeletedEventSummary) => {
    const token = getStoredAccessToken();
    if (!token || isTokenExpired()) {
      setNotice('Reconnect Google first, then try again.');
      return;
    }
    setRestoringId(item.id);
    const ok = await restoreDeletedEvent(token, item.id);
    setRestoringId(null);
    if (!ok) {
      setNotice("Couldn't restore that event - it may have been removed already.");
      await load();
      return;
    }
    // Lets the app that owns the event list let it back in and fetch it.
    window.dispatchEvent(new CustomEvent('aot_event_restored', { detail: { id: item.id } }));
    setNotice(`"${item.title}" is back.`);
    await load();
  };

  // Nothing deleted (or not signed in): don't add an empty card to Settings.
  if (!items || items.length === 0) return notice ? <NoticeOnly text={notice} onClose={() => setNotice(null)} /> : null;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center gap-3 mb-3">
        <span className="p-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
          <Trash2 className="w-5 h-5" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Recently deleted</h3>
          <p className="text-xs text-slate-500">Kept for {RETENTION_DAYS} days, then removed for good. Restore brings back the event and its tasks.</p>
        </div>
      </div>

      {notice && <p className="text-xs text-slate-600 mb-2">{notice}</p>}

      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
              <p className="text-[11px] text-slate-500">
                {item.eventDate} · {item.milestoneCount} {item.milestoneCount === 1 ? 'task' : 'tasks'} · removed for good in {daysLeft(item.deletedAt)} days
              </p>
            </div>
            <button
              type="button"
              onClick={() => void restore(item)}
              disabled={restoringId === item.id}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
            >
              {restoringId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
              <span>Restore</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const NoticeOnly: React.FC<{ text: string; onClose: () => void }> = ({ text, onClose }) => (
  <div className="bg-white border border-slate-200/90 rounded-2xl px-5 py-3 shadow-xs text-xs text-slate-700 flex items-center justify-between gap-3">
    <span>{text}</span>
    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Dismiss">
      ×
    </button>
  </div>
);
