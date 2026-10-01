import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Copy, CalendarPlus, Loader2, Mail } from 'lucide-react';
import { Logo } from './Logo';
import { aiJsonHeaders } from '../services/aiRequest';
import { checkAppSession } from '../services/appSession';
import { getCurrentUser, setCurrentUser as setGlobalCurrentUser, AuthUser } from '../services/accountManager';
import { useUserProfile } from '../contexts/UserProfileContext';
import type { CalendarChoice } from '../utils/calendarPoll';

/**
 * /setup/calendar - the setup for Outlook, Apple Calendar and other
 * calendars, in three steps on one page (no pop-up):
 *   1. sign in with an email link (the link brings you back here),
 *   2. copy your private calendar link,
 *   3. add it to your calendar app, with the steps for that app.
 * Google Calendar users connect directly instead and never see this page.
 */

type App = 'outlook' | 'apple' | 'other';

const APP_NAME: Record<App, string> = { outlook: 'Outlook', apple: 'Apple Calendar', other: 'your calendar' };

const HOW_TO: Record<App, Array<{ label: string; steps: string[] }>> = {
  outlook: [
    {
      label: 'Outlook on the web or the new Outlook app',
      steps: ['Open your calendar.', 'Click Add calendar, then Subscribe from web.', 'Paste the link, name it "Ahead Of Time" and click Import.'],
    },
    {
      label: 'Classic Outlook for Windows',
      steps: ['Go to Calendar.', 'Home → Add Calendar → From Internet.', 'Paste the link and click OK, then Yes.'],
    },
    {
      label: 'Outlook on your phone',
      steps: ['Add it once in Outlook on the web (above): it then shows up on your phone too.'],
    },
  ],
  apple: [
    {
      label: 'iPhone or iPad',
      steps: ['Tap "Open in Calendar" below - or:', 'Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.', 'Paste the link and tap Next, then Save.'],
    },
    {
      label: 'Mac',
      steps: ['Click "Open in Calendar" below - or:', 'In Calendar: File → New Calendar Subscription.', 'Paste the link, click Subscribe, set Auto-refresh to "Every hour" and click OK.'],
    },
  ],
  other: [
    {
      label: 'Any calendar app',
      steps: ['Look for "Subscribe to calendar", "Add calendar from URL" or "From Internet".', 'Paste the link.', 'Name it "Ahead Of Time" and save.'],
    },
  ],
};

const appFromChoice = (choice?: CalendarChoice | string | null): App =>
  choice === 'outlook' ? 'outlook' : choice === 'apple' ? 'apple' : 'other';

const StepCard: React.FC<{ n: number; title: string; state: 'done' | 'active' | 'next'; summary?: React.ReactNode; children?: React.ReactNode }> = ({
  n,
  title,
  state,
  summary,
  children,
}) => (
  <section
    className={`rounded-2xl border p-4 sm:p-5 transition-all ${
      state === 'active' ? 'bg-white border-[#182A42]/20 shadow-md' : state === 'done' ? 'bg-white/70 border-slate-200' : 'bg-white/40 border-slate-200/70'
    }`}
  >
    <div className="flex items-center gap-3">
      <span
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
          state === 'done' ? 'bg-aot-sage text-[#20463a]' : state === 'active' ? 'bg-[#182A42] text-white' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {state === 'done' ? <Check className="w-4 h-4" /> : n}
      </span>
      <div className="min-w-0">
        <h2 className={`text-sm sm:text-base font-extrabold leading-tight ${state === 'next' ? 'text-slate-400' : 'text-[#182A42]'}`}>{title}</h2>
        {summary && <div className="text-xs text-slate-500 mt-0.5 truncate">{summary}</div>}
      </div>
    </div>
    {state === 'active' && children && <div className="mt-4 sm:pl-11 space-y-3 text-sm text-slate-700">{children}</div>}
  </section>
);

export const CalendarSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile();
  const params = new URLSearchParams(location.search);
  const app: App = appFromChoice(params.get('cal') || profile?.primaryCalendar);
  const name = APP_NAME[app];

  // Step 1: who is signed in (an email-link or Google session on the server).
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 2: the private feed link.
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [howTo, setHowTo] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void checkAppSession().then((sessionEmail) => {
      if (cancelled) return;
      setChecking(false);
      if (!sessionEmail) return;
      const userEmail = sessionEmail.toLowerCase().trim();
      setSignedInAs(userEmail);
      // Back from the email link: make this the account in the app too.
      const current = getCurrentUser();
      if (current?.email !== userEmail) {
        const user: AuthUser = { id: userEmail, email: userEmail, name: userEmail.split('@')[0], provider: 'email', connectedAt: new Date().toISOString() };
        setGlobalCurrentUser(user);
      }
      try {
        localStorage.setItem('aot_onboarding_completed', 'true');
      } catch {
        // storage blocked: fine for this visit
      }
      if (params.get('signed_in')) navigate('/setup/calendar' + (params.get('cal') ? `?cal=${params.get('cal')}` : ''), { replace: true });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once signed in: turn the feed on (or fetch it) and show the link.
  useEffect(() => {
    if (!signedInAs) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/calendar-feed', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify({ action: 'enable' }) });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.ok || !data.url) throw new Error(data?.error || 'Could not make your calendar link. Try again.');
        if (!cancelled) setFeedUrl(data.url);
      } catch (e: any) {
        if (!cancelled) setFeedError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedInAs]);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/email-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next: 'calendar-setup', cal: app }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'That did not work. Try again.');
      setSentTo(email.trim());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
    } catch {
      window.prompt('Copy this link', feedUrl);
    }
    setCopied(true);
    setHasCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const step1 = signedInAs ? 'done' : 'active';
  const step2 = !signedInAs ? 'next' : hasCopied ? 'done' : 'active';
  const step3 = signedInAs && hasCopied ? 'active' : 'next';
  const webcal = feedUrl ? feedUrl.replace(/^https?:\/\//, 'webcal://') : null;
  const guides = HOW_TO[app];

  return (
    <div className="min-h-screen w-full bg-[#f1f7fe] flex flex-col p-4 sm:p-6 font-sans text-slate-900">
      <div className="max-w-xl mx-auto w-full flex items-center justify-between py-2">
        <Logo variant="small" />
        <button type="button" onClick={() => navigate('/dashboard')} className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
          Skip for now
        </button>
      </div>

      <main className="max-w-xl mx-auto w-full mt-4 sm:mt-8 space-y-3">
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-black text-[#182A42] tracking-tight">Get your tasks into {name}</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Three steps, about two minutes. After that every prep task shows up in {name} by itself, with a link to tick it off.
          </p>
        </div>

        <StepCard n={1} title="Sign in with your email" state={checking ? 'active' : step1} summary={signedInAs ? `Signed in as ${signedInAs}` : undefined}>
          {checking ? (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking…
            </p>
          ) : sentTo ? (
            <div className="p-3.5 rounded-xl bg-[#eef6f3] border border-[#cfe3dc] text-[#20463a] space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <Mail className="w-4 h-4" /> Check your inbox
              </p>
              <p className="text-sm">
                We sent a link to <b>{sentTo}</b>. Open it and tap <b>Sign in</b>: it brings you straight back here, to step 2.
              </p>
              <p className="text-xs">Nothing after a minute? Check Junk or the Other tab. The link works once, for 15 minutes.</p>
              <button type="button" onClick={() => setSentTo(null)} className="text-xs font-bold underline underline-offset-2 cursor-pointer">
                Use another address
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="space-y-2">
              <p className="text-slate-600">No password and no Google account needed: we email you a sign-in link.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Your email address"
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-[#182A42]"
                />
                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Email me a link
                </button>
              </div>
              {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            </form>
          )}
        </StepCard>

        <StepCard n={2} title="Copy your calendar link" state={step2} summary={step2 === 'done' ? 'Copied' : undefined}>
          <p className="text-slate-600">This is your own private link. Your calendar app uses it to fetch your tasks.</p>
          {feedError ? (
            <p className="text-xs font-semibold text-rose-600">{feedError}</p>
          ) : !feedUrl ? (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Making your link…
            </p>
          ) : (
            <>
              <div className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 break-all text-slate-700 select-all">{feedUrl}</div>
              <button
                type="button"
                onClick={copy}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <p className="text-xs text-slate-500">Keep it private: anyone with it can see your tasks.</p>
            </>
          )}
        </StepCard>

        <StepCard n={3} title={`Paste it into ${name}`} state={step3}>
          {guides.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {guides.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  role="tab"
                  aria-selected={howTo === i}
                  onClick={() => setHowTo(i)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer ${
                    howTo === i ? 'bg-[#182A42] text-white border-[#182A42]' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          <ol className="list-decimal pl-5 space-y-1.5">
            {guides[Math.min(howTo, guides.length - 1)].steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            {app === 'apple' && webcal && (
              <a
                href={webcal}
                className="px-4 py-2.5 rounded-xl border border-[#182A42] text-[#182A42] hover:bg-slate-50 text-sm font-bold inline-flex items-center gap-2"
              >
                <CalendarPlus className="w-4 h-4" /> Open in Calendar
              </a>
            )}
            <button
              type="button"
              onClick={copy}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link again'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {name === 'Outlook' ? 'Outlook' : 'Your calendar'} checks the link every few hours, so new tasks can take a while to show up. Each task has a ✓ Mark done link.
          </p>
        </StepCard>

        <div className="pt-3 pb-8">
          <button
            type="button"
            disabled={!(signedInAs && hasCopied)}
            onClick={() => navigate('/dashboard')}
            className="w-full py-3.5 rounded-2xl bg-[#182A42] hover:bg-[#162a3f] text-white font-bold text-sm shadow-md inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Done - plan my first event <ArrowRight className="w-4 h-4" />
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">You can find the link again any time in Settings → Connections → Calendar feed.</p>
        </div>
      </main>
    </div>
  );
};
