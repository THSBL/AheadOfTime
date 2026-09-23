import React, { useState } from 'react';
import { Layers, Info, ChevronDown, Loader2, Check } from 'lucide-react';
import type { PreparationLevel } from '../types';

interface PreparationLevelSwitcherProps {
  level: PreparationLevel;
  reasons: string[];
  setBy?: 'aot' | 'user';
  onChangeLevel: (newLevel: PreparationLevel) => void;
  isBusy?: boolean;
}

const LEVEL_LABEL: Record<PreparationLevel, string> = {
  essentials: 'Essentials',
  balanced: 'Balanced',
  extensive: 'Extensive',
};

const LEVEL_TAGLINE: Record<PreparationLevel, string> = {
  essentials: 'Core milestones only.',
  balanced: 'Key steps and logistics.',
  extensive: 'Granular tasks and contingencies.',
};

const LEVELS: PreparationLevel[] = ['essentials', 'balanced', 'extensive'];

/**
 * Surfaces AOT's preparation-level assessment for this event and lets the
 * user override it - architecture reset Phase 6. Collapsed by default
 * (just the current level + a one-line summary), matching the same
 * progressive-disclosure pattern BackgroundSyncPanel.tsx already uses: an
 * info icon reveals AOT's own reasons, a "Change" link reveals the 3-way
 * picker. Once the user picks a level, it's sticky - see
 * preparationAssessment.ts's isExplicit handling - so this never gets
 * silently overridden again, only re-suggested.
 */
export const PreparationLevelSwitcher: React.FC<PreparationLevelSwitcherProps> = ({
  level,
  reasons,
  setBy,
  onChangeLevel,
  isBusy = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="pt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/70">
          <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
          <span>{LEVEL_LABEL[level]} plan</span>
        </div>
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
        <button
          type="button"
          onClick={() => setIsEditing((v) => !v)}
          aria-expanded={isEditing}
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#182A42] hover:underline cursor-pointer"
        >
          Change
          <ChevronDown className={`w-3 h-3 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
        </button>
        {isBusy && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
      </div>

      {showInfo && (
        <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed max-w-md">
          {reasons.length > 0 ? reasons.join(' ') : 'Based on your role in this event and what it actually requires.'}
          {setBy === 'user' && ' You set this level yourself, so it stays until you change it.'}
        </p>
      )}

      {isEditing && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Preparation level">
          {LEVELS.map((l) => {
            const active = l === level;
            return (
              <button
                key={l}
                type="button"
                disabled={isBusy}
                title={LEVEL_TAGLINE[l]}
                aria-pressed={active}
                onClick={() => {
                  if (!active) onChangeLevel(l);
                  setIsEditing(false);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-[#182A42] text-white border-[#182A42]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {active && <Check className="w-3 h-3 stroke-[3]" />}
                {LEVEL_LABEL[l]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
