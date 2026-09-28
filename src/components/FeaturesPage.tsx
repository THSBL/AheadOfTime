import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { usePageMeta } from '../utils/usePageMeta';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { Check, MessageSquare, Send, CalendarDays, Plane, Calendar } from 'lucide-react';
// Same "has this browser already been through onboarding or connected a
// calendar" check ProtectedRoute/LandingRoute use - without it, "Go to
// Dashboard" for a brand-new visitor just bounces straight back to "/"
// (ProtectedRoute redirects an unonboarded visitor away from /dashboard),
// which looked identical to clicking "Overview".
const hasEnteredAppBefore = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (
      localStorage.getItem('aot_onboarding_completed') === 'true' ||
      localStorage.getItem('has_completed_onboarding') === 'true' ||
      localStorage.getItem('aot_calendar_connected') === 'true' ||
      Boolean(getStoredAccessToken() && !isTokenExpired())
    );
  } catch {
    return false;
  }
};

/** A tick list item: sage square with a navy check, like the app's own checkmarks. */
const Point: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex gap-2.5 text-sm sm:text-[15px] text-slate-200">
    <span className="w-[18px] h-[18px] mt-0.5 rounded-md bg-aot-sage text-[#182A42] flex items-center justify-center shrink-0">
      <Check className="w-3 h-3 stroke-[3.5]" />
    </span>
    <span>{children}</span>
  </li>
);

const Feature: React.FC<{ kicker: string; title: string; intro: string; points: string[]; flip?: boolean; picture: React.ReactNode }> = ({
  kicker,
  title,
  intro,
  points,
  flip,
  picture,
}) => (
  <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center py-10 border-t border-white/10">
    <div className={flip ? 'md:order-2' : ''}>
      <p className="text-xs font-extrabold uppercase tracking-widest text-aot-sage">{kicker}</p>
      <h2 className="mt-1.5 mb-2.5 text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight text-balance">{title}</h2>
      <p className="text-slate-300 mb-3">{intro}</p>
      <ul className="space-y-2">
        {points.map((p) => (
          <Point key={p}>{p}</Point>
        ))}
      </ul>
    </div>
    <div aria-hidden="true">{picture}</div>
  </section>
);

// Small pictures of the real screens (static, illustrative).
const Tag: React.FC<{ tone?: 'late' | 'today'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={`text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
      tone === 'late' ? 'bg-rose-100 text-rose-700' : tone === 'today' ? 'bg-[#182A42] text-white' : 'bg-slate-100 text-slate-500'
    }`}
  >
    {children}
  </span>
);

const ChatPicture = () => (
  <div className="bg-white text-[#182A42] rounded-3xl p-4 shadow-2xl shadow-black/40 text-[13px] space-y-2">
    <p className="ml-auto max-w-[85%] w-fit bg-[#182A42] text-white rounded-2xl px-3 py-2">Dinner with 6 friends in London on Saturday 3 Oct</p>
    <p className="max-w-[85%] w-fit bg-slate-100 rounded-2xl px-3 py-2">
      Done: 4 prep steps, from booking the table this week to sharing the plan on Friday. Anyone with dietary needs?
    </p>
    <p className="ml-auto max-w-[85%] w-fit bg-[#182A42] text-white rounded-2xl px-3 py-2">Two are vegetarian</p>
    <p className="max-w-[85%] w-fit bg-slate-100 rounded-2xl px-3 py-2">Added "Check a vegetarian menu" before the booking. ✓</p>
  </div>
);

const WeekPicture = () => {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="bg-white text-[#182A42] rounded-3xl p-4 shadow-2xl shadow-black/40 text-[13px]">
      <div className="flex items-center gap-3 pb-2">
        <div className="relative w-11 h-11">
          <svg width="44" height="44" className="-rotate-90">
            <circle cx="22" cy="22" r={r} fill="none" stroke="#e6ebf0" strokeWidth="5" />
            <circle cx="22" cy="22" r={r} fill="none" stroke="#6fa596" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - 3 / 7)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black">3/7</span>
        </div>
        <div>
          <p className="font-black text-[15px] leading-tight">You are almost ahead</p>
          <p className="text-xs text-slate-500">4 to wrap up this week</p>
        </div>
      </div>
      <p className="mt-1 px-2 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-[10.5px] font-extrabold uppercase tracking-wider">Overdue</p>
      {[
        ['Restaurant table booked', <Tag tone="late">1d</Tag>],
      ].map(([t, tag]) => (
        <div key={t as string} className="flex items-center gap-2.5 px-1 py-2.5">
          <span className="w-[15px] h-[15px] rounded border-[1.5px] border-slate-300" />
          <span className="flex-1 font-semibold">{t}</span>
          {tag}
        </div>
      ))}
      <p className="px-2 py-1.5 rounded-lg bg-slate-50 text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">This week</p>
      {[
        ['Invitations sent', <Tag tone="today">Today</Tag>],
        ['Flights & hotel locked', <Tag>In 3 days</Tag>],
      ].map(([t, tag], i) => (
        <div key={t as string} className={`flex items-center gap-2.5 px-1 py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
          <span className="w-[15px] h-[15px] rounded border-[1.5px] border-slate-300" />
          <span className="flex-1 font-semibold">{t}</span>
          {tag}
        </div>
      ))}
    </div>
  );
};

const CalendarPicture = () => (
  <div className="bg-[#22344a] border border-white/10 rounded-3xl p-3.5 shadow-2xl shadow-black/40 text-[13px] space-y-2">
    {[
      { title: 'Trip to Cologne', next: 'Flights and hotel', when: 'In 24 days', pushed: false, Icon: Plane },
      { title: 'Business trip to Hungary', next: 'Corporate hotel', when: 'In 33 days', pushed: true, Icon: Plane },
      { title: 'London Dinner Party', next: 'Table reserved', when: 'In 46 days', pushed: false, Icon: Calendar },
    ].map(({ title, next, when, pushed, Icon }) => (
      <div key={title} className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/[0.05] border border-white/10">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${pushed ? 'bg-aot-sage text-[#447463]' : 'bg-white/10 text-slate-400'}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-white truncate">{title}</span>
          <span className="block text-[11px] text-slate-400">Next: {next}</span>
        </span>
        <span className="text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-sky-100 whitespace-nowrap">{when}</span>
      </div>
    ))}
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#0f1c2d] pl-3 pr-2 py-2 text-xs text-slate-300">
      <span>2 plans not in your calendar yet</span>
      <span className="bg-white text-[#182A42] font-extrabold rounded-xl px-2.5 py-1.5 whitespace-nowrap">Push to Calendar</span>
    </div>
  </div>
);

const UpdatesPicture = () => (
  <div className="bg-white text-[#182A42] rounded-3xl p-4 shadow-2xl shadow-black/40 text-[13px]">
    <p className="font-bold text-sm">Your prep update</p>
    <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5 my-2">
      {['Off', 'Daily', 'Weekly', 'Monthly'].map((f) => (
        <span key={f} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${f === 'Weekly' ? 'bg-white shadow-xs' : 'text-slate-500'}`}>
          {f}
        </span>
      ))}
    </div>
    <p className="text-xs text-slate-500">Mondays at 08:00 · via Telegram</p>
    <div className="flex items-center justify-between py-2.5 mt-2 border-t border-slate-100">
      <span className="font-semibold">Plan with AI</span>
      <span className="relative w-10 h-6 rounded-full bg-[#447463]">
        <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white" />
      </span>
    </div>
    <div className="flex items-center justify-between py-2.5 border-t border-slate-100">
      <span className="font-semibold text-rose-700">Delete account</span>
      <span className="text-slate-400">›</span>
    </div>
  </div>
);

export const FeaturesPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta(
    'Features - Ahead Of Time',
    'Plan any event or trip backwards from its date: in the app, on Telegram or from your Google Calendar. This week in focus, tasks in Google Tasks, updates on your schedule.'
  );

  const returning = hasEnteredAppBefore();
  const goToAppOrOnboarding = () => navigate(returning ? '/dashboard' : '/onboarding');
  const primaryLabel = returning ? 'Open my dashboard' : 'Get started free';
  const primaryClass =
    'px-5 py-3 rounded-2xl bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] font-extrabold text-sm shadow-lg shadow-black/25 transition-colors cursor-pointer';

  return (
    <div className="min-h-screen bg-[#182A42] text-white flex flex-col font-sans">
      <header className="sticky top-0 z-50 bg-[#182A42]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/')} className="cursor-pointer" aria-label="Ahead Of Time home">
            <Logo variant="dark" size="sm" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
            >
              Overview
            </button>
            <button type="button" onClick={goToAppOrOnboarding} className={`${primaryClass} !py-2 !px-4 !shadow-none`}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4">
        <div className="text-center pt-12 pb-10 sm:pt-16">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.12] text-balance">
            Everything that gets you ready, worked out backwards.
          </h1>
          <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
            Tell Ahead Of Time what's coming. It plans every step back from the date, keeps this week in focus, and puts the tasks in your
            Google Calendar.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={goToAppOrOnboarding} className={primaryClass}>
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-100 text-[#182A42] font-bold text-sm transition-colors cursor-pointer"
            >
              See how it works
            </button>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              { Icon: MessageSquare, label: 'Chat in the app' },
              { Icon: Send, label: 'Telegram' },
              { Icon: CalendarDays, label: 'Scan your Google Calendar' },
            ].map(({ Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-semibold text-slate-200">
                <Icon className="w-3.5 h-3.5 text-aot-sage" />
                {label}
              </span>
            ))}
          </div>
        </div>

        <Feature
          kicker="Plan from anywhere"
          title="Say it the way you'd tell a friend."
          intro={'Type "Birthday trip to New York, Nov 17-20" in the app or on Telegram, or let Scan agenda find what\'s already in your calendar.'}
          points={[
            'A trip spread over hotel stays and flights becomes one trip, one plan',
            'Something missing? "Two guests are vegetarian" updates the plan',
            'Choose how much help: Basic, Balanced or Extensive',
          ]}
          picture={<ChatPicture />}
        />
        <Feature
          flip
          kicker="My Week Ahead"
          title="Only what matters this week."
          intro="One card with what's late and what's due in the next seven days. The ring fills as you tick things off. Everything further out waits quietly below."
          points={[
            'Overdue first, then this week, in full detail',
            'Added a plan late? Catch up in one tap instead of a wall of red',
            'Move a task to tomorrow or next week when life happens',
          ]}
          picture={<WeekPicture />}
        />
        <Feature
          kicker="Your calendar"
          title="In Google Calendar and Tasks, when you want it."
          intro="Push a plan and its steps land in Google Tasks (or as calendar blocks). A green icon shows which plans are fully in your calendar; the bar counts what isn't yet."
          points={[
            "Ticked off in Google Tasks? The app picks it up within about 15 minutes while it's open",
            'Nothing is added twice, and your own appointments are never deleted without asking by name',
            'Background Sync: plans you confirm on Telegram go straight into your calendar',
          ]}
          picture={<CalendarPicture />}
        />
        <Feature
          flip
          kicker="Updates and privacy"
          title="A nudge when it suits you. Your data stays yours."
          intro="Get your prep update daily, weekly or monthly on Telegram or email, or turn it off."
          points={[
            'Plan with AI (Google Gemini) or switch it off and use built-in templates',
            'Google access is stored encrypted and only used for your own calendar',
            'Delete your account and everything stored for it, any time',
          ]}
          picture={<UpdatesPicture />}
        />

        <section id="how-it-works" className="scroll-mt-20 grid grid-cols-1 md:grid-cols-3 gap-3.5 py-10 border-t border-white/10" aria-label="How it works">
          {[
            ["Tell it what's coming", 'In the app, on Telegram, or by scanning your calendar.'],
            ['Get the plan', 'Every step dated back from the event, sized to how much help you want.'],
            ['Stay ahead', 'This week in focus, tasks in Google, a nudge on your schedule.'],
          ].map(([title, text], i) => (
            <div key={title} className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <span className="w-8 h-8 rounded-full bg-aot-sage text-[#182A42] font-black flex items-center justify-center mb-2.5">{i + 1}</span>
              <h3 className="font-bold text-base">{title}</h3>
              <p className="text-sm text-slate-300 mt-1">{text}</p>
            </div>
          ))}
        </section>

        <div className="text-center py-12 border-t border-white/10">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-5">Ready before it starts.</h2>
          <button type="button" onClick={goToAppOrOnboarding} className={primaryClass}>
            {primaryLabel}
          </button>
        </div>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} Ahead Of Time</p>
          <div className="flex gap-4">
            <button type="button" onClick={() => navigate('/privacy')} className="hover:text-white transition cursor-pointer">Privacy Policy</button>
            <button type="button" onClick={() => navigate('/feedback')} className="hover:text-white transition cursor-pointer">Feedback</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
