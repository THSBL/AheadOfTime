import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CalendarPlus, Copy, MessageSquare, Send } from 'lucide-react';
import { Logo } from './Logo';
import { usePageMeta } from '../utils/usePageMeta';
import { hasEnteredAppBefore } from './FeaturesPage';

type CalendarId = 'google' | 'outlook' | 'apple';

const CALENDARS: Array<{ id: CalendarId; label: string }> = [
  { id: 'google', label: 'Google Calendar' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'apple', label: 'Apple Calendar' },
];

// ---- small mock-ups (plain markup, no screenshots, so they stay current) ----

const Frame: React.FC<{ title?: string; children: React.ReactNode; dark?: boolean }> = ({ title, children, dark }) => (
  <div className={`rounded-2xl overflow-hidden border shadow-xl shadow-black/30 ${dark ? 'bg-[#223349] border-white/10' : 'bg-white border-white/20'}`}>
    {title && (
      <div className={`px-3.5 py-2 text-[11px] font-bold border-b ${dark ? 'text-slate-300 border-white/10' : 'text-slate-500 border-slate-100 bg-slate-50'}`}>{title}</div>
    )}
    <div className="p-3.5 text-[13px] text-slate-800">{children}</div>
  </div>
);

const TaskChip: React.FC<{ children: React.ReactNode; tone?: 'aot' | 'own' }> = ({ children, tone = 'aot' }) => (
  <div
    className={`rounded-md px-2 py-1 text-[12px] font-semibold border-l-[3px] ${
      tone === 'aot' ? 'bg-[#dfeee9] text-[#20463a] border-[#447463]' : 'bg-[#e8efff] text-[#1d3a8a] border-[#3b6fe0]'
    }`}
  >
    {children}
  </div>
);

const Steps5: React.FC<{ at: number }> = ({ at }) => (
  <div className="grid grid-cols-5 gap-1 mb-3">
    {['Import', 'Plan', 'Check', 'Sync', 'Auto'].map((s, i) => (
      <div key={s}>
        <div className={`h-1 rounded-full ${i < at ? 'bg-aot-sage' : i === at ? 'bg-[#182A42]' : 'bg-slate-200'}`} />
        <p className={`mt-1 text-[10px] font-bold ${i === at ? 'text-[#182A42]' : 'text-slate-400'}`}>{s}</p>
      </div>
    ))}
  </div>
);

const ScanMock = () => (
  <Frame title="Scan agenda · step 1 of 5">
    <Steps5 at={0} />
    <p className="font-black text-[#182A42] text-[15px] mb-2">We found 5 events worth preparing for</p>
    {['Weekend in Lisbon · Trip', 'Dinner with Sam & Lucy · Dinner', "Mila turns 8 · Party"].map((t) => (
      <div key={t} className="flex items-center gap-2 py-1.5 border-t border-slate-100">
        <span className="w-4 h-4 rounded bg-[#182A42] text-white flex items-center justify-center">
          <Check className="w-3 h-3" />
        </span>
        <span className="font-semibold">{t}</span>
      </div>
    ))}
    <div className="mt-2 rounded-xl bg-[#182A42] text-white text-center font-bold py-2">Make plans for 5 events →</div>
  </Frame>
);

const CheckMock = () => (
  <Frame title="Scan agenda · step 3 of 5">
    <Steps5 at={2} />
    <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Should we plan these?</p>
    <div className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 mb-2">
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-bold px-1.5 rounded-full bg-slate-100 text-slate-600">Subscription</span>
        <p className="font-bold text-[#182A42]">Gym free trial ends</p>
      </div>
      <span className="w-7 h-7 rounded-full border border-slate-200 text-rose-600 flex items-center justify-center font-black">✕</span>
      <span className="w-7 h-7 rounded-full bg-[#182A42] text-white flex items-center justify-center">
        <Check className="w-3.5 h-3.5" />
      </span>
    </div>
    {['Weekend in Lisbon · 10 tasks', 'Dinner with Sam & Lucy · 4 tasks'].map((t) => (
      <div key={t} className="flex items-center justify-between py-1.5 border-t border-slate-100">
        <span className="font-semibold">{t}</span>
        <span className="w-8 h-5 rounded-full bg-[#447463] relative">
          <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white" />
        </span>
      </div>
    ))}
  </Frame>
);

const GoogleDayMock = () => (
  <Frame title="Google Calendar · Tue 29 Sep">
    <div className="grid grid-cols-[1fr_120px] gap-3">
      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-400">09:00</p>
        <TaskChip tone="own">Team meeting</TaskChip>
        <p className="text-[11px] text-slate-400">13:00</p>
        <p className="text-[11px] text-slate-400">17:00</p>
      </div>
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 space-y-1.5">
        <p className="text-[11px] font-bold text-slate-500">Google Tasks</p>
        {['Book flights & hotel', 'Confirm dietary needs'].map((t) => (
          <p key={t} className="flex items-start gap-1.5 text-[11.5px]">
            <span className="mt-0.5 w-3 h-3 rounded-full border-2 border-slate-400 shrink-0" />
            {t}
          </p>
        ))}
      </div>
    </div>
  </Frame>
);

const FeedSettingsMock: React.FC<{ subscribe: boolean }> = ({ subscribe }) => (
  <Frame title="Ahead Of Time · Settings → Connections">
    <div className="flex items-center gap-2 mb-2">
      <CalendarPlus className="w-4 h-4 text-slate-600" />
      <span className="font-bold text-slate-900 flex-1">Calendar feed</span>
      <span className="text-[11px] font-bold px-2 rounded-full bg-aot-sage text-[#20463a]">On</span>
    </div>
    <p className="text-[12px] text-slate-500 mb-2.5">Subscribe once and your tasks appear in your own calendar.</p>
    <div className="flex gap-2">
      <span className={`px-3 py-1.5 rounded-lg text-[12px] font-bold ${subscribe ? 'bg-[#182A42] text-white ring-2 ring-aot-sage ring-offset-1' : 'bg-[#182A42] text-white'}`}>
        Subscribe in my calendar
      </span>
      <span className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border border-[#182A42] text-[#182A42] inline-flex items-center gap-1 ${subscribe ? '' : 'ring-2 ring-aot-sage ring-offset-1'}`}>
        <Copy className="w-3 h-3" /> Copy link
      </span>
    </div>
  </Frame>
);

const OutlookSubscribeMock = () => (
  <Frame title="Outlook · Add calendar">
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <div className="space-y-1 text-[12px]">
        {['Your calendars', 'Add from directory', 'Subscribe from web', 'Upload from file'].map((t) => (
          <p key={t} className={`px-2 py-1 rounded ${t === 'Subscribe from web' ? 'bg-[#e8efff] text-[#1d3a8a] font-bold' : 'text-slate-500'}`}>
            {t}
          </p>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500">Link to the calendar</p>
        <p className="px-2 py-1.5 rounded border border-slate-300 text-[11px] text-slate-600 truncate">https://aheadoftime.app/api/calendar/feed/…</p>
        <p className="text-[11px] text-slate-500">Calendar name</p>
        <p className="px-2 py-1.5 rounded border border-slate-300 text-[12px]">Ahead Of Time tasks</p>
        <span className="inline-block px-3 py-1 rounded bg-[#0f6cbd] text-white text-[12px] font-bold">Import</span>
      </div>
    </div>
  </Frame>
);

const AppleSubscribeMock = () => (
  <Frame title="iPhone · Calendar">
    <div className="text-center space-y-2 py-1">
      <p className="font-bold text-slate-900">Subscribe to “Ahead Of Time tasks”?</p>
      <p className="text-[12px] text-slate-500">aheadoftime.app</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <span className="py-1.5 rounded-lg bg-slate-100 text-[#0a66ff] font-semibold">Cancel</span>
        <span className="py-1.5 rounded-lg bg-slate-100 text-[#0a66ff] font-bold">Subscribe</span>
      </div>
    </div>
  </Frame>
);

const FeedDayMock: React.FC<{ app: 'Outlook' | 'Apple Calendar' }> = ({ app }) => (
  <Frame title={`${app} · Friday 2 October`}>
    <p className="text-[11px] text-slate-400 mb-1">all-day</p>
    <div className="space-y-1 mb-2">
      <TaskChip>Book restaurant · Trip to Seven</TaskChip>
      <TaskChip>Passport renewals · Trip to Seven</TaskChip>
    </div>
    <p className="text-[11px] text-slate-400">11:00</p>
    <TaskChip tone="own">Team meeting</TaskChip>
  </Frame>
);

const FeedNotesMock = () => (
  <Frame title="Tap a task: the notes">
    <p className="font-bold text-slate-900 mb-1.5">Book restaurant · Trip to Seven</p>
    <div className="rounded-xl bg-slate-50 p-2.5 text-[12px] leading-relaxed space-y-1.5">
      <p>
        ✓ Mark this task done: <span className="text-[#0a66ff] font-semibold">aheadoftime.app/…</span>
      </p>
      <p>
        ✓✓ All tasks for Trip to Seven done: <span className="text-[#0a66ff] font-semibold">aheadoftime.app/…</span>
      </p>
      <p>
        ✕ Trip to Seven not happening? Remove the plan: <span className="text-[#0a66ff] font-semibold">aheadoftime.app/…</span>
      </p>
    </div>
  </Frame>
);

const DonePageMock = () => (
  <Frame dark>
    <div className="bg-white rounded-xl p-4 text-center">
      <p className="text-[12px] font-black text-aot-sage mb-1">Ahead Of Time</p>
      <p className="font-black text-[#182A42] text-[15px]">✓ Book restaurant</p>
      <p className="text-[12px] text-slate-500 my-1.5">Done, nice work. Your calendar shows it as done at its next refresh.</p>
      <span className="block py-1.5 rounded-lg bg-slate-100 text-[#182A42] font-bold text-[12px]">Undo</span>
    </div>
  </Frame>
);

// ---- steps per calendar -----------------------------------------------------

interface Step {
  title: string;
  text: string;
  picture?: React.ReactNode;
}

const TELL_STEP: Step = {
  title: "Tell it what's coming",
  text: 'Type "Birthday trip to New York, Nov 17-20" in the app or on Telegram. Ahead Of Time plans every step back from the date.',
};

const STEPS: Record<CalendarId, { intro: string; steps: Step[]; note: string }> = {
  google: {
    intro: 'Google Calendar works both ways: Ahead Of Time reads your agenda to find what needs preparing, and puts the tasks back in your calendar.',
    steps: [
      { title: 'Sign in with Google', text: 'One sign-in connects your account and your calendar.' },
      { title: 'Scan your agenda', text: 'We read the months ahead and pick the events worth preparing for. Routine meetings, public holidays and plain birthdays are left out.', picture: <ScanMock /> },
      { title: 'Check the plans', text: 'Everything is on by default. We only ask about the kinds of entries we are unsure of, and each answer becomes a rule for next time.', picture: <CheckMock /> },
      { title: 'Sync to your calendar', text: 'The tasks land in Google Tasks (or as calendar blocks) on the right days. Your own events stay as they are.', picture: <GoogleDayMock /> },
      { title: 'Stay ahead', text: 'Tick tasks off in Google Tasks or in the app; both stay in step. Background Sync keeps an eye on new events for you.' },
    ],
    note: 'Prefer to type? You can always tell it what is coming in the app or on Telegram too.',
  },
  outlook: {
    intro: 'Outlook gets your tasks through a calendar feed: subscribe once, and your prep tasks show up in Outlook as their own calendar.',
    steps: [
      TELL_STEP,
      { title: 'Turn on the calendar feed', text: 'In Settings → Connections → Calendar feed, turn it on and copy your private link.', picture: <FeedSettingsMock subscribe={false} /> },
      { title: 'Subscribe in Outlook', text: 'Outlook on the web: Add calendar → Subscribe from web, paste the link and name it "Ahead Of Time tasks". Outlook for Windows and Mac pick it up from your account.', picture: <OutlookSubscribeMock /> },
      { title: 'Your tasks in Outlook', text: 'Each task is an all-day entry on its date, in its own colour, so it never blocks your time.', picture: <FeedDayMock app="Outlook" /> },
      { title: 'Tick off from Outlook', text: 'Open a task: one tap marks it done, marks the whole plan done, or removes a plan that is no longer happening. No sign-in needed, and there is always an Undo.', picture: <FeedNotesMock /> },
    ],
    note: 'Outlook refreshes subscribed calendars on its own schedule, which can take a few hours. The calendar feed needs an account; signing in is with a Google account for now, and scanning your agenda works with Google Calendar only.',
  },
  apple: {
    intro: 'Apple Calendar gets your tasks through a calendar feed: subscribe once, and your prep tasks show up on your iPhone, iPad and Mac.',
    steps: [
      TELL_STEP,
      { title: 'Turn on the calendar feed', text: 'In Settings → Connections → Calendar feed, turn it on and tap "Subscribe in my calendar".', picture: <FeedSettingsMock subscribe /> },
      { title: 'Confirm in Apple Calendar', text: 'Your iPhone or Mac asks to subscribe. Tap Subscribe. On a Mac you can also use File → New Calendar Subscription and paste the link.', picture: <AppleSubscribeMock /> },
      { title: 'Your tasks in Apple Calendar', text: 'Each task is an all-day entry on its date, in a separate calendar you can show or hide with one tick.', picture: <FeedDayMock app="Apple Calendar" /> },
      { title: 'Tick off from your calendar', text: 'Open a task and tap the link in its notes: done for this task, done for the whole plan, or remove the plan. The page confirms it, with an Undo.', picture: <DonePageMock /> },
    ],
    note: 'Apple Calendar usually refreshes subscribed calendars within the hour. The calendar feed needs an account; signing in is with a Google account for now, and scanning your agenda works with Google Calendar only.',
  },
};

export const HowItWorksPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selected: CalendarId = (['google', 'outlook', 'apple'] as const).find((c) => c === params.get('calendar')) || 'google';
  const { intro, steps, note } = STEPS[selected];
  usePageMeta(
    'How it works - Ahead Of Time',
    'How Ahead Of Time works with Google Calendar, Outlook and Apple Calendar: plan backwards from any event and get the tasks in the calendar you already use.'
  );

  const returning = hasEnteredAppBefore();
  const primaryLabel = returning ? 'Open my dashboard' : 'Get started free';
  const goToApp = () => navigate(returning ? '/dashboard' : '/onboarding');
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
            <button type="button" onClick={() => navigate('/features')} className="hidden sm:block text-sm font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition cursor-pointer">
              Features
            </button>
            <button type="button" onClick={goToApp} className={`${primaryClass} !py-2 !px-4 !shadow-none`}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4">
        <div className="text-center pt-12 pb-8 sm:pt-16">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.12] text-balance">How it works with your calendar</h1>
          <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">Pick the calendar you use. The planning is the same; only how the tasks reach your calendar differs.</p>
          <div className="mt-6 inline-flex bg-white/10 p-1 rounded-2xl gap-1" role="tablist" aria-label="Your calendar">
            {CALENDARS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected === c.id}
                onClick={() => setParams({ calendar: c.id }, { replace: true })}
                className={`px-3.5 sm:px-5 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  selected === c.id ? 'bg-white text-[#182A42]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-5 text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">{intro}</p>
        </div>

        <ol className="space-y-5 pb-6">
          {steps.map((step, i) => (
            <li
              key={`${selected}-${step.title}`}
              className={`grid grid-cols-1 ${step.picture ? 'md:grid-cols-2' : ''} gap-5 items-center rounded-3xl bg-white/[0.04] border border-white/10 p-5 sm:p-6`}
            >
              <div className="flex gap-3.5">
                <span className="w-9 h-9 rounded-full bg-aot-sage text-[#182A42] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black">{step.title}</h2>
                  <p className="mt-1.5 text-sm sm:text-[15px] text-slate-300 leading-relaxed">{step.text}</p>
                </div>
              </div>
              {step.picture && <div>{step.picture}</div>}
            </li>
          ))}
        </ol>
        <p className="text-center text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto pb-8">{note}</p>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pb-10">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 flex gap-3">
            <MessageSquare className="w-5 h-5 text-aot-sage shrink-0" />
            <p className="text-sm text-slate-300">
              <b className="text-white">In the app:</b> My Week Ahead keeps this week in focus; Timeline &amp; Tasks shows every plan.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 flex gap-3">
            <Send className="w-5 h-5 text-aot-sage shrink-0" />
            <p className="text-sm text-slate-300">
              <b className="text-white">On Telegram:</b> plan on the go and get your update daily, weekly or monthly.
            </p>
          </div>
        </section>

        <div className="text-center pb-14">
          <button type="button" onClick={goToApp} className={primaryClass}>
            {primaryLabel}
          </button>
        </div>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} Ahead Of Time</p>
          <div className="flex gap-4">
            <button type="button" onClick={() => navigate('/features')} className="hover:text-white transition cursor-pointer">Features</button>
            <button type="button" onClick={() => navigate('/privacy')} className="hover:text-white transition cursor-pointer">Privacy Policy</button>
            <button type="button" onClick={() => navigate('/feedback')} className="hover:text-white transition cursor-pointer">Feedback</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
