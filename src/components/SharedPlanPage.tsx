import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Logo } from './Logo';
import { AdSlot } from './AdSlot';
import { formatDisplayDate } from '../utils/tminusRules';
import { usePageMeta } from '../utils/usePageMeta';
import { trackButtonClick, trackEvent } from '../services/analytics';

/**
 * /p/:token - a plan someone shared: its steps, dates and ideas, read-only
 * (server/sharedPlans.ts). Below it, an invitation to plan your own (the
 * try-out, no sign-in) and one ad block. Not indexed by search engines.
 */

interface Snapshot {
  title: string;
  eventDate: string;
  endDate?: string;
  eventTime?: string;
  steps: Array<{ title: string; date: string; ideas: string[]; done: boolean }>;
}

export const SharedPlanPage: React.FC = () => {
  const { token = '' } = useParams();
  const [plan, setPlan] = useState<Snapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone'>('loading');

  usePageMeta(plan ? `${plan.title} - shared plan - Ahead Of Time` : 'Shared plan - Ahead Of Time');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan/shared?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && data?.ok && data.plan) {
          setPlan(data.plan);
          setState('ok');
          trackEvent('shared_plan_view');
        } else setState('gone');
      })
      .catch(() => !cancelled && setState('gone'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen w-full bg-[#f1f7fe] flex flex-col p-4 sm:p-6 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto w-full flex items-center justify-between py-2">
        <a href="/" aria-label="Ahead Of Time home">
          <Logo variant="small" />
        </a>
        <a href="/try" className="text-xs font-bold text-[#182A42] hover:underline">Plan your own</a>
      </div>

      <main className="max-w-2xl mx-auto w-full mt-4 sm:mt-8 space-y-4 pb-10">
        {state === 'loading' && (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading the plan…</p>
        )}

        {state === 'gone' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <h1 className="text-lg font-black text-[#182A42]">This shared plan isn't available</h1>
            <p className="text-sm text-slate-600">The person who shared it may have stopped sharing. You can still plan your own, free.</p>
          </section>
        )}

        {state === 'ok' && plan && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-wider text-[#447463]">Shared plan</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-black text-[#182A42] leading-tight">{plan.title}</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              {formatDisplayDate(plan.eventDate)}
              {plan.endDate ? ` – ${formatDisplayDate(plan.endDate)}` : ''}
              {plan.eventTime ? ` · ${plan.eventTime}` : ''}
            </p>
            <ol className="mt-5 relative border-l-2 border-slate-200 ml-1.5 space-y-4">
              {plan.steps.map((s, i) => (
                <li key={`${s.date}-${i}`} className="pl-4 relative">
                  <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${s.done ? 'bg-[#447463]' : 'bg-aot-sage'}`} />
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{formatDisplayDate(s.date)}</p>
                  <p className={`text-sm font-bold leading-snug ${s.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {s.done && <Check className="inline w-3.5 h-3.5 mr-1 text-[#447463]" />}
                    {s.title}
                  </p>
                  {s.ideas.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {s.ideas.map((idea) => (
                        <li key={idea} className="text-xs text-slate-500 leading-snug pl-3 relative before:content-['›'] before:absolute before:left-0.5 before:text-[#447463]">
                          {idea}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              <li className="pl-4 relative">
                <span className="absolute -left-[8px] top-1 w-3.5 h-3.5 rounded-full bg-[#182A42] border-2 border-white" />
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{formatDisplayDate(plan.eventDate)}</p>
                <p className="text-sm font-black text-[#182A42]">The day itself</p>
              </li>
            </ol>
          </section>
        )}

        {state !== 'loading' && (
          <section className="rounded-2xl bg-[#182A42] text-white p-5 space-y-2">
            <p className="text-base font-black">Something coming up yourself?</p>
            <p className="text-sm text-slate-300">
              Describe it in your own words and Ahead Of Time plans the prep backwards from the date, with ideas for every step. Free, no sign-in needed to try.
            </p>
            <a
              href="/try"
              onClick={() => trackButtonClick('Plan your own', 'shared_plan')}
              className="inline-flex items-center gap-2 mt-1 px-4 py-2.5 rounded-xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-sm font-black"
            >
              Plan your own <ArrowRight className="w-4 h-4" />
            </a>
          </section>
        )}

        {state === 'ok' && <AdSlot place="sharedPlan" className="pt-2" />}
      </main>
    </div>
  );
};
