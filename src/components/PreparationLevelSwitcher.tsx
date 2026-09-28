import React, { useState } from 'react';
import { Layers, Info, ChevronDown, Loader2, Check } from 'lucide-react';
import type { PreparationLevel } from '../types';

interface PreparationLevelSwitcherProps {
  level: PreparationLevel;
  onChangeLevel: (newLevel: PreparationLevel) => void;
  isBusy?: boolean;
}

// "Essentials/Balanced/Extensive plan" read too much like a paid pricing
// tier - "Help" makes clear this is about how much assistance AOT gives,
// not a subscription level. Internal PreparationLevel values ('essentials'
// | 'balanced' | 'extensive') are unchanged - this is display text only.
const LEVEL_LABEL: Record<PreparationLevel, string> = {
  essentials: 'Basic Help',
  balanced: 'Balanced Help',
  extensive: 'Extensive Help',
};

const LEVEL_TAGLINE: Record<PreparationLevel, string> = {
  essentials: "Core milestones only. Perfect for when you're just on the guest list.",
  balanced: 'Key steps and logistics. Ideal for events where you own the execution.',
  extensive: 'Time to decide: look at options and share them before every booking.',
};

const LEVELS: PreparationLevel[] = ['essentials', 'balanced', 'extensive'];

/**
 * Surfaces AOT's preparation-level assessment for this event and lets the
 * user override it - architecture reset Phase 6. One button shows the
 * current level and opens the 3-way picker itself (no separate "Change"
 * link); the info icon beside it explains what the level covers. Once the
 * user picks a level, it's sticky - see preparationAssessment.ts's
 * isExplicit handling - so this never gets silently overridden again, only
 * re-suggested.
 */
export const PreparationLevelSwitcher: React.FC<PreparationLevelSwitcherProps> = ({
  level,
  onChangeLevel,
  isBusy = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          disabled={isBusy}
          title="How much help AOT gives for this event"
          className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-bold bg-slate-100 hover:bg-slate-200/70 text-[#182A42] border border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <Layers className="w-3 h-3 shrink-0" />}
          <span>{LEVEL_LABEL[level]}</span>
          <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Why this level?"
          aria-expanded={showInfo}
          title="Why this level?"
          className="text-slate-400 hover:text-slate-700 cursor-pointer"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      {showInfo && (
        <p className="mt-1.5 text-[11px] font-semibold text-slate-700 leading-relaxed max-w-xs">{LEVEL_TAGLINE[level]}</p>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            aria-label="Preparation level"
            className="absolute right-0 top-full mt-1.5 z-40 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg p-1.5"
          >
            {LEVELS.map((l) => {
              const active = l === level;
              return (
                <li key={l} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!active) onChangeLevel(l);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-start gap-2 cursor-pointer transition-colors ${
                      active ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 stroke-[3] ${active ? 'text-[#182A42]' : 'text-transparent'}`} />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900">{LEVEL_LABEL[l]}</span>
                      <span className="block text-[11px] text-slate-500 leading-snug">{LEVEL_TAGLINE[l]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
