import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { AI_SETTING_EVENT, getCachedAiPlanningEnabled, refreshAiPlanningEnabled, saveAiPlanningEnabled } from '../services/aiSettings';

/**
 * Settings -> Credentials: whether plans are written with AI (Google
 * Gemini). Reached from the chat's AI notice (?setup=ai), which scrolls here.
 */
export const AiPlanningCard: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(getCachedAiPlanningEnabled());
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshAiPlanningEnabled().then(setEnabled);
    const onChange = (e: Event) => setEnabled(Boolean((e as CustomEvent).detail?.enabled));
    window.addEventListener(AI_SETTING_EVENT, onChange);
    return () => window.removeEventListener(AI_SETTING_EVENT, onChange);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') !== 'ai') return;
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    params.delete('setup');
    const rest = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setIsSaving(true);
    setNotice(null);
    const saved = await saveAiPlanningEnabled(next);
    setEnabled(next);
    setIsSaving(false);
    setNotice(saved ? null : "Saved on this device - it will be applied to your account as soon as you're back online.");
  };

  return (
    <div ref={cardRef} id="ai-planning" className="scroll-mt-20 bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">Plan with AI (Google Gemini)</h2>
            <p className="text-xs text-slate-500">{enabled ? 'On - plans are written by AI' : 'Off - plans use built-in templates'}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Plan with AI"
          onClick={toggle}
          disabled={isSaving}
          className={`relative w-12 h-7 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-60 ${enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
          {isSaving && <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />}
        </button>
      </div>

      <div className="text-xs text-slate-600 leading-relaxed space-y-2">
        <p>
          <strong className="text-slate-800">When on,</strong> what you type in the chat or on Telegram, and the details of the events you plan
          (title, dates, place, calendar entries you import, and profile answers such as your home area or a pet), are sent to
          Google's Gemini API to write tailored plans. Only what's needed for the plan is sent - never your password or Google sign-in.
        </p>
        <p>
          <strong className="text-slate-800">When off,</strong> nothing is sent to an AI provider. Plans come from our built-in templates: they still
          work, but are more generic and won't pick up the specific details you add.
        </p>
        <p>
          <a href="/privacy" className="font-semibold text-sky-800 underline underline-offset-2">Privacy policy</a>
        </p>
      </div>

      {notice && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{notice}</p>}
    </div>
  );
};
