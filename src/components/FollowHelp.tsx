import React from 'react';

export type CalendarApp = 'google' | 'apple' | 'outlook';

/** Where a followed plan shows up, per calendar app, and what to tap when it doesn't. */
export function FollowHelp({ app, title }: { app: CalendarApp; title: string }) {
  const name = <b>"{title}"</b>;
  const steps =
    app === 'google'
      ? [
          <>Google Calendar opens: tap <b>Add</b>.</>,
          <>It shows under <b>Other calendars</b> as {name}.</>,
          <>
            On an Android phone, switch it on once: Google Calendar app → menu → <b>Settings</b> → {name} → turn on <b>Sync</b>.
          </>,
          <>Google checks for changes a few times a day.</>,
        ]
      : app === 'apple'
        ? [
            <>Tap <b>Subscribe</b> when your phone or Mac asks.</>,
            <>
              Don't see it? In the Calendar app, tap <b>Calendars</b> and tick {name}.
            </>,
            <>Changes come in by themselves; Settings → Calendar → Accounts → Fetch decides how often.</>,
          ]
        : [
            <>Outlook opens: choose <b>Import</b> (or Add).</>,
            <>
              Don't see it? Under <b>Other calendars</b>, tick {name}.
            </>,
            <>On your phone it can take a while to appear. Outlook checks for changes every few hours.</>,
          ];
  return (
    <div className="rounded-2xl bg-aot-green-50 border border-aot-green-200 p-3 space-y-1.5">
      <p className="text-xs font-black text-aot-green-800">Don't see it in your calendar?</p>
      <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700 leading-snug">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
