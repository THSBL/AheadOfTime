import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import { AI_SETTING_EVENT, getCachedAiPlanningEnabled, refreshAiPlanningEnabled, saveAiPlanningEnabled } from '../services/aiSettings';

/**
 * Settings -> Connections: whether plans are written with AI (Google
 * Gemini). Reached from the chat's AI notice (?setup=ai), which scrolls here.
 */
export const AiPlanningCard: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(getCachedAiPlanningEnabled());
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Arriving from the chat's AI notice: open the details straight away.
  const [openFromLink] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('setup') === 'ai';
    } catch {
      return false;
    }
  });

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
    <div ref={cardRef} id="ai-planning" className="scroll-mt-24">
      <SettingsRow
        icon={<Sparkles className="w-[18px] h-[18px]" />}
        title="Plan with AI"
        subtitle={enabled ? 'Google Gemini writes tailored plans' : 'Off - plans use built-in templates'}
        open={Boolean(notice) || openFromLink}
        right={
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Plan with AI"
            onClick={toggle}
            disabled={isSaving}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-60 ${enabled ? 'bg-[#447463]' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
            {isSaving && <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white" />}
          </button>
        }
      >
        <p>
          <strong className="text-slate-800">On:</strong> your chat and Telegram messages and the details of the events you plan (title, dates,
          place, imported calendar entries, profile answers like home area or a pet) go to Google's Gemini API to write the plan. Never your
          password or Google sign-in.
        </p>
        <p>
          <strong className="text-slate-800">Off:</strong> nothing goes to an AI provider; plans come from built-in templates, more generic.
        </p>
        <p>
          <a href="/privacy" className="font-semibold text-[#182A42] underline underline-offset-2">Privacy policy</a>
        </p>
        {notice && <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{notice}</p>}
      </SettingsRow>
    </div>
  );
};
