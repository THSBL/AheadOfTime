import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, MessageSquareText, Sparkles } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { saveTrialPlan } from '../services/accountManager';
import { openSignIn } from './SignInModal';
import { trackButtonClick, trackEvent } from '../services/analytics';

/**
 * The try-out (/try): the real app, Create New Event chat and all, for a
 * visitor who hasn't signed in. This card sits on top: before a plan, it
 * says nothing is saved; once there is one, it asks how happy they are and,
 * if happy, offers to push it to their calendar (sign-in, which carries the
 * plan into the account - adoptTrialPlan). Not happy: back to the chat to
 * say what to change. Planning calls carry the try-out header
 * (aiJsonHeaders), within the server's TRIAL_LIMITS.
 */

type Rating = 'love' | 'good' | 'meh' | 'bad';
const RATINGS: Array<{ id: Rating; face: string; label: string }> = [
  { id: 'love', face: '😍', label: 'Love it' },
  { id: 'good', face: '🙂', label: 'Good' },
  { id: 'meh', face: '😐', label: 'So-so' },
  { id: 'bad', face: '😞', label: 'Not right' },
];

interface TrialCardProps {
  /** The plan being tried (the newest one), if any yet. */
  plan: CalendarEvent | null;
  /** Back to the chat to say what should change. */
  onAdjust: () => void;
}

export const TrialCard: React.FC<TrialCardProps> = ({ plan, onAdjust }) => {
  const navigate = useNavigate();
  const [rating, setRating] = useState<Rating | null>(null);
  const [choosingCalendar, setChoosingCalendar] = useState(false);

  useEffect(() => {
    trackEvent('trial_open');
  }, []);

  // Keep the newest version on this device, ready to join the account.
  useEffect(() => {
    if (plan) saveTrialPlan(plan);
  }, [plan]);

  // A changed plan deserves a fresh opinion.
  const planVersion = plan ? `${plan.id}:${plan.updatedAt || ''}:${(plan.milestones || []).length}` : '';
  useEffect(() => {
    setRating(null);
    setChoosingCalendar(false);
  }, [planVersion]);

  // Signed in from here: the plan joined the account - open it (Google:
  // with the push window).
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const user = (e as CustomEvent<{ user: { provider?: string } | null }>).detail?.user;
      if (!user || !plan) return;
      navigate(`/events/${encodeURIComponent(plan.id)}${user.provider === 'google' ? '?sync=pending' : ''}`);
    };
    window.addEventListener('aot_account_switched', onSwitch);
    return () => window.removeEventListener('aot_account_switched', onSwitch);
  }, [plan, navigate]);

  const happy = rating === 'love' || rating === 'good';

  // Before a plan exists the page is just the description box: no banner.
  if (!plan) return null;

  // Pinned to the bottom of the screen, next to the plan it's about.
  return (
    <div className="fixed z-40 bottom-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(44rem,calc(100%-1.5rem))]">
      <section className="rounded-2xl bg-white border border-aot-sage shadow-2xl shadow-slate-900/30 p-3.5 space-y-3" aria-label="Your try-out plan">
        <p className="text-sm font-extrabold text-[#182A42]">
          How happy are you with this plan?
        </p>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Rate this plan">
          {RATINGS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRating(r.id);
                setChoosingCalendar(false);
                trackEvent('trial_rating', { rating: r.id });
              }}
              aria-pressed={rating === r.id}
              className={`py-2 rounded-xl border text-center cursor-pointer transition-all ${
                rating === r.id ? 'border-[#182A42] bg-[#182A42]/5 ring-1 ring-[#182A42]' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="block text-xl leading-none" aria-hidden="true">{r.face}</span>
              <span className="block text-[11px] font-bold text-slate-600 mt-1">{r.label}</span>
            </button>
          ))}
        </div>

        {rating && !happy && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <p className="text-xs text-slate-600 flex-1">Tell the assistant what should be different - it adjusts the plan.</p>
            <button
              type="button"
              onClick={() => {
                trackEvent('trial_change_requested', { rating });
                onAdjust();
              }}
              className="px-4 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageSquareText className="w-4 h-4" /> Adjust the plan
            </button>
          </div>
        )}

        {happy && !choosingCalendar && (
          <div className="pt-1 space-y-1.5">
            <button
              type="button"
              onClick={() => {
                trackButtonClick('Push to my calendar', 'trial');
                setChoosingCalendar(true);
              }}
              className="w-full py-3 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-black text-sm shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4" /> Push to my calendar
            </button>
            <p className="text-[11px] text-slate-500 text-center">Free. Sign in once and every step lands in your calendar, with a reminder when it's due.</p>
          </div>
        )}

        {happy && choosingCalendar && (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-bold text-slate-600">Which calendar do you use?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => openSignIn('Continue with Google to put this plan in your Google Calendar. Your plan comes with you.')}
                className="py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold cursor-pointer"
              >
                Google Calendar
              </button>
              {(['outlook', 'apple', 'other'] as const).map((cal) => (
                <button
                  key={cal}
                  type="button"
                  onClick={() => navigate(`/setup/calendar?cal=${cal}`)}
                  className="py-2.5 rounded-xl border border-[#182A42] text-[#182A42] hover:bg-slate-50 text-sm font-bold cursor-pointer"
                >
                  {cal === 'outlook' ? 'Outlook' : cal === 'apple' ? 'Apple Calendar' : 'Something else'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Your plan comes with you when you sign in. By signing in you agree to our{' '}
              <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
