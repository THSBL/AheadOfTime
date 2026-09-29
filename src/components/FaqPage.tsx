import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, HelpCircle, MessageSquare } from 'lucide-react';
import { Logo } from './Logo';
import { usePageMeta } from '../utils/usePageMeta';

interface FaqEntry {
  question: string;
  answer: string;
}

const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "Does it work with Apple Calendar or Outlook?",
    answer:
      "Yes. Google Calendar works fully: scan your agenda and sync the tasks. For Apple Calendar, Outlook or any other calendar, sign in with your email (no Google account needed), turn on the calendar feed in Settings → Connections and subscribe to it once. Your tasks then show up as all-day entries in a separate \"Ahead Of Time tasks\" calendar. The How it works page shows the steps for each calendar.",
  },
  {
    question: "The calendar feed is read-only. How do I tick off or remove tasks there?",
    answer:
      "Every task in the feed has one-tap links in its notes: mark this task done, mark all tasks of the plan done, or remove the plan when the event isn't happening anymore. No sign-in needed, and each has an Undo. Tasks of events that are over leave the feed by themselves. Your calendar shows changes at its next refresh: Apple usually within the hour, Outlook can take a few hours.",
  },
  {
    question: "I deleted an event, but it still shows up in Google Calendar or Tasks - why?",
    answer:
      "The delete window offers three choices: remove it from Ahead Of Time only (Google stays as it is), also remove the prep tasks from Google, or also delete the event itself from Google Calendar. The first is picked by default, so check which one you chose. The button always says exactly what will happen.",
  },
  {
    question: "Can prep tasks show up as Google Calendar events instead of Google Tasks?",
    answer:
      "Yes. When you sync an event to Google, you'll see a \"Show preparation tasks in Google as\" choice: Google Tasks (recommended - they're checkable to-dos that don't crowd your calendar grid) or Calendar Events (30-minute blocks on the date they're due). Your choice is remembered for next time. You can also set it as part of your profile in Settings.",
  },
  {
    question: "What's the difference between \"Overdue\", \"This week\", and \"Looking ahead\"?",
    answer:
      "Overdue and This week show every task needing attention right now, with full detail (sub-tasks, category, edit/delete). Looking ahead is a flat, always-visible list of everything further out, in date order - deliberately smaller and more compact so it reads as \"further away\" while still letting you scan for a missing prep step.",
  },
  {
    question: "How do I fix something the assistant got wrong, or add a detail it missed?",
    answer:
      "Open the event and use the \"Want to add or change something? Tell us in your own words\" box - type the correction in plain language (e.g. \"actually we need a rental car too\") and it updates the plan without you having to hand-edit each task.",
  },
  {
    question: "Does Ahead Of Time plan for pet care when I have a trip?",
    answer:
      "If you tell us you have a dependent pet (Settings > Questionnaire Profile, or during onboarding), trips detected on your calendar automatically get a pet-sitter / boarding prep milestone. You can also just mention a pet by name in the event itself and it'll be picked up the same way.",
  },
  {
    question: "How often does my Google Calendar sync?",
    answer:
      "Automatically, about once every 15 minutes while the app is open, plus whenever the tab regains focus. You can also hit the sync icon next to your agenda status, or \"Force Sync Now\" in the agenda details popover, for an immediate check.",
  },
  {
    question: "I saw a stale error in the browser console after an update - is something broken?",
    answer:
      "Usually not - that's a leftover from the dev server's hot-reload cache referencing code that's already been replaced. A full page reload clears it. If the same error keeps happening after a fresh reload, that's worth reporting.",
  },
  {
    question: "Where do I report a bug or share feedback?",
    answer:
      "Use the Feedback page (linked from your dashboard) - it has a quick monthly satisfaction check-in and a \"Report Something\" tab for bugs or feature ideas any time, no waiting required.",
  },
];

export const FaqPage: React.FC = () => {
  usePageMeta(
    'FAQ - Ahead Of Time',
    'Frequently asked questions about Ahead Of Time - deleting events, Google Calendar sync, prep milestones, and more.'
  );
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center">
            <Logo variant="small" />
          </a>
          <a
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-xl transition font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 text-sky-700 bg-sky-50 border border-sky-200/80 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>FAQ</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-sm text-slate-500 max-w-xl">
            Common questions about deleting events, Google Calendar sync, and how prep milestones work.
          </p>
        </div>

        <div className="space-y-2.5">
          {FAQ_ENTRIES.map((entry, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={entry.question}
                className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-all cursor-pointer"
                >
                  <span className="text-sm font-bold text-slate-900">{entry.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{entry.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-bold text-slate-900">Still have a question?</p>
            <p className="text-xs text-slate-500">Tell us what's missing or report an issue.</p>
          </div>
          <a
            href="/feedback"
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Go to Feedback</span>
          </a>
        </div>
      </main>
    </div>
  );
};
