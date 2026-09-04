import React, { useState, useEffect } from 'react';
import { Sparkles, Brain, CheckCircle2, ChevronDown, ChevronUp, Loader2, Clock, Zap } from 'lucide-react';

interface ThinkingModuleProps {
  promptText?: string;
  className?: string;
}

const THINKING_STEPS = [
  { id: 1, text: 'Deconstructing event context & temporal parameters', detail: 'Extracting event category, target date, guest count, and logistics requirements...' },
  { id: 2, text: 'Calculating reverse T-Minus lead times & deadlines', detail: 'Determining optimal backward countdown markers from target date against reference horizon...' },
  { id: 3, text: 'Synthesizing booking deadlines & preparation checklists', detail: 'Assembling venue confirmations, catering orders, packing tasks, and reminder triggers...' },
  { id: 4, text: 'Capturing new active event & finalizing timeline', detail: 'Indexing event into active agenda and structuring calendar sync payloads...' }
];

export const ThinkingModule: React.FC<ThinkingModuleProps> = ({ promptText, className = '' }) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);

      // Advance step index smoothly based on elapsed time
      if (elapsed > 2400) {
        setActiveStepIndex(3);
      } else if (elapsed > 1400) {
        setActiveStepIndex(2);
      } else if (elapsed > 600) {
        setActiveStepIndex(1);
      } else {
        setActiveStepIndex(0);
      }
    }, 80);

    return () => clearInterval(interval);
  }, []);

  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  return (
    <div className={`w-full bg-white/95 backdrop-blur-md rounded-3xl border border-sky-200/90 shadow-lg shadow-sky-100/50 overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${className}`}>
      
      {/* Header Bar */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-50/80 via-white to-indigo-50/50 border-b border-sky-100/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#0f172a] to-sky-800 text-white flex items-center justify-center shadow-md shadow-sky-900/20">
              <Brain className="w-5 h-5 animate-pulse text-sky-200" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full">
                AI Thinking Process
              </span>
              <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                {elapsedSec}s
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span>Synthesizing Ahead Of Time Milestones</span>
              <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-600 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
        >
          <span>{isExpanded ? 'Hide Steps' : 'View Steps'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Optional Prompt Highlight */}
      {promptText && (
        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 text-xs text-slate-600 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="font-semibold text-slate-700 truncate">
            Targeting: &ldquo;{promptText}&rdquo;
          </span>
        </div>
      )}

      {/* Thinking Steps Progression */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-3">
          {THINKING_STEPS.map((step, idx) => {
            const isCompleted = idx < activeStepIndex;
            const isCurrent = idx === activeStepIndex;
            const isPending = idx > activeStepIndex;

            return (
              <div
                key={step.id}
                className={`p-3 rounded-2xl transition-all duration-300 flex items-start gap-3 border ${
                  isCurrent
                    ? 'bg-sky-50/70 border-sky-300/80 shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50/40 border-emerald-200/60'
                    : 'bg-slate-50/40 border-slate-200/50 opacity-50'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {isCompleted ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center animate-spin">
                      <Loader2 className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                      {step.id}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs sm:text-sm font-bold ${
                      isCurrent ? 'text-sky-950 font-black' : isCompleted ? 'text-emerald-950' : 'text-slate-600'
                    }`}>
                      {step.text}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-200/80 text-sky-900 animate-pulse">
                        Processing
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] font-bold text-emerald-700">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {step.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pulsing Footer Loading Line */}
      <div className="h-1 bg-slate-100 overflow-hidden relative">
        <div className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500 w-full animate-pulse" />
      </div>

    </div>
  );
};
