import React from 'react';
import { X } from 'lucide-react';
import { useUserProfile } from '../contexts/UserProfileContext';
import { readScanPrefs, saveScanPrefs } from '../services/scanPrefs';
import { ENTRY_KIND_LABELS, type EntryKind, type ScanPrefs, type ScanVerdict } from '../utils/eventEligibility';

const VERDICT_TEXT: Record<ScanVerdict, string> = { plan: 'Always plan', skip: 'Leave out', unsure: 'Ask me' };

/**
 * Settings -> Account: everything Scan agenda learned (the birthday choice,
 * Teach Ahead Of Time swipes), each removable, so a wrong swipe is never stuck.
 */
export const CalendarHabitsCard: React.FC = () => {
  const { profile, saveProfile } = useUserProfile();
  const prefs: ScanPrefs = profile?.scanPrefs || readScanPrefs();

  const save = (next: ScanPrefs) => {
    saveScanPrefs(next);
    saveProfile({ ...(profile || {}), scanPrefs: next });
  };

  const kindRules = Object.entries(prefs.kindVerdicts || {}) as Array<[EntryKind, ScanVerdict]>;
  const titleRules = prefs.titleRules || [];

  const removeKind = (kind: EntryKind) => {
    const kindVerdicts = { ...(prefs.kindVerdicts || {}) };
    delete kindVerdicts[kind];
    save({ ...prefs, kindVerdicts });
  };
  const removeTitle = (key: string, exact?: boolean) =>
    save({ ...prefs, titleRules: titleRules.filter((r) => !(r.key === key && Boolean(r.exact) === Boolean(exact))) });

  const row = (label: React.ReactNode, detail: string, onRemove?: () => void) => (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove this rule" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs divide-y divide-slate-100">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Birthdays</p>
          <p className="text-xs text-slate-500">
            {prefs.birthdays === 'plan' ? 'A small plan: card or gift' : 'Left out, unless the entry says "gift", "party" or "prep"'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => save({ ...prefs, birthdays: prefs.birthdays === 'plan' ? 'skip' : 'plan' })}
          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-xs font-bold text-[#182A42] cursor-pointer"
        >
          {prefs.birthdays === 'plan' ? 'Leave out' : 'Plan them'}
        </button>
      </div>
      {kindRules.map(([kind, verdict]) => (
        <React.Fragment key={kind}>{row(ENTRY_KIND_LABELS[kind], VERDICT_TEXT[verdict], () => removeKind(kind))}</React.Fragment>
      ))}
      {titleRules.map((r) => (
        <React.Fragment key={`${r.exact ? 'x' : 'w'}-${r.key}`}>
        {row(
          <>
            "{r.example || r.key}" <span className="text-slate-400 font-normal">→ {ENTRY_KIND_LABELS[r.kind]}</span>
          </>,
          r.exact ? `${VERDICT_TEXT[r.verdict]} · for this exact title` : `${VERDICT_TEXT[r.verdict]} · for entries starting with "${r.key}"`,
          () => removeTitle(r.key, r.exact)
        )}
        </React.Fragment>
      ))}
      {kindRules.length === 0 && titleRules.length === 0 && (
        <p className="px-3.5 py-2.5 text-xs text-slate-500">Scan your agenda and answer a few quick swipes to teach Ahead Of Time what to plan.</p>
      )}
    </div>
  );
};
