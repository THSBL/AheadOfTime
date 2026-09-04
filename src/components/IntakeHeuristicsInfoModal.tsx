import React from 'react';
import { X, BookOpen, Clock, CheckCircle2, Radio, HelpCircle, Gift, Home, Ticket, Sparkles } from 'lucide-react';

interface IntakeHeuristicsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntakeHeuristicsInfoModal: React.FC<IntakeHeuristicsInfoModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wide">
              Ahead Of Time Preparation Rules Matrix
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs sm:text-sm text-zinc-300">
          
          {/* Operational Modes */}
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              Core Operational Modes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-zinc-950 p-3.5 rounded-2xl border border-amber-500/40 shadow-sm">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs sm:text-sm mb-1.5">
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  <span>CREATE_AND_INTAKE</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                  New event detected with missing contextual parameters. Extracts base event, locks calendar date, and asks 1–2 targeted intake questions.
                </p>
              </div>

              <div className="bg-zinc-950 p-3.5 rounded-2xl border border-rose-500/40 shadow-sm">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs sm:text-sm mb-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>RESOLVE_MILESTONES</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                  Complete event details provided or user answered intake questions. Builds backward preparation milestones with precise dates.
                </p>
              </div>

              <div className="bg-zinc-950 p-3.5 rounded-2xl border border-emerald-500/40 shadow-sm">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs sm:text-sm mb-1.5">
                  <Radio className="w-4 h-4 shrink-0 animate-pulse" />
                  <span>RESEARCH_REQUIRED</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                  Event date depends on unconfirmed external release (e.g. Glastonbury ticket sale). Establishes early watchpoint monitoring alert.
                </p>
              </div>
            </div>
          </div>

          {/* Heuristic Rules Breakdown */}
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400" />
              Ahead Of Time Preparation Milestones
            </h4>
            <div className="space-y-3.5">
              
              {/* Birthdays */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-zinc-100">
                  <Gift className="w-4 h-4 text-rose-400" />
                  <span>Birthdays & Parties</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-rose-300 font-bold">Group Gift:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-30d: Initiate pot & rally team</li>
                      <li>T-10d: Purchase gift</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-rose-300 font-bold">Solo Gift:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-14d: Order gift</li>
                      <li>T-2d: Wrapping & card check</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-rose-300 font-bold">Themed / Costume:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-14d: Source outfit / costume</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-rose-300 font-bold">Logistics / Transport:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-2h: Book taxi / ride</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Hosting Visitors */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-zinc-100">
                  <Home className="w-4 h-4 text-amber-400" />
                  <span>Friends Visiting / Hosting</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-amber-300 font-bold">Dining & Activities:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-30d: Make reservations</li>
                      <li>T-7d: Confirm headcount</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-amber-300 font-bold">Groceries & Drinks:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-3d: Shopping list</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-amber-300 font-bold">Home Prep:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-1d: Guest room prep</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Festivals */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-zinc-100">
                  <Ticket className="w-4 h-4 text-emerald-400" />
                  <span>Festivals & Concerts</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-emerald-300 font-bold">Ticket Drops Unconfirmed:</strong>
                    <p className="text-zinc-400 mt-1.5 text-xs leading-relaxed font-medium">
                      Set early watchpoint alert at historical announcement window (e.g., late October for Glastonbury).
                    </p>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <strong className="text-emerald-300 font-bold">Group Travel & Camping:</strong>
                    <ul className="list-disc list-inside text-zinc-300 mt-1.5 space-y-1 font-mono text-xs">
                      <li>T-60d: Gear check & logistics</li>
                      <li>T-14d: Packing list</li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-zinc-950 px-6 py-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
          >
            Close Matrix
          </button>
        </div>

      </div>
    </div>
  );
};
