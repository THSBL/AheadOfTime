import { canUseAppSession } from '../services/appSession';
import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Undo2, Loader2, ChevronDown } from 'lucide-react';
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
  // Hidden by default - this is an undo shelf, not something that should
  // compete for attention with the settings above it every time this page
  // loads.
  const [isExpanded, setIsExpanded] = useState(false);

  const load = useCallback(async () => {
    const stored = getStoredAccessToken();
    const token = stored && !isTokenExpired() ? stored : null;
    if (!token && !(await canUseAppSession())) {
      setItems([]);
      return;
    }
    setItems(await fetchDeletedEvents(token));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (item: DeletedEventSummary) => {
    const stored = getStoredAccessToken();
    const token = stored && !isTokenExpired() ? stored : null;
    if (!token && !(await canUseAppSession())) {
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
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-3 cursor-pointer"
      >
        <span className="p-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
          <Trash2 className="w-5 h-5" />
        </span>
        <div className="text-left flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900">Recently deleted ({items.length})</h3>
          <p className="text-xs text-slate-500">Kept for {RETENTION_DAYS} days, then removed for good. Restore brings back the event and its tasks.</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {notice && <p className="text-xs text-slate-600 mt-3">{notice}</p>}

      {isExpanded && (
        <ul className="divide-y divide-slate-100 mt-3">
          {items.map((item) => (
            <li key={item.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {item.eventDate} · removed for good in {daysLeft(item.deletedAt)} days
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
              </div>
              {item.milestoneTitles.length > 0 && (
                <ul className="mt-1.5 pl-3 border-l-2 border-slate-100 space-y-0.5">
                  {item.milestoneTitles.map((title, idx) => (
                    <li key={idx} className="text-[11px] text-slate-500 truncate">
                      {title}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
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
