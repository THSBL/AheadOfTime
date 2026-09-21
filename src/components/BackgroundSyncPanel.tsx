import React, { useState } from 'react';
import { Zap, Check, Loader2, Info, ChevronDown } from 'lucide-react';

export type NotifyChannel = 'telegram' | 'email' | 'in_app';

export interface NotifyPrefsDTO {
  channels: NotifyChannel[];
  frequency: 'daily' | 'weekly';
  hour: number;
  weekday: number;
  timezone: string;
}

interface BackgroundSyncPanelProps {
  linked: boolean | null;
  isLinking: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  telegramLinked: boolean;
  emailAvailable: boolean;
  accountEmail: string;
  prefs: NotifyPrefsDTO | null;
  /** False until the user has saved preferences at least once. */
  prefsSaved: boolean;
  onChangePrefs: (partial: Partial<NotifyPrefsDTO>) => void;
  onSendTest: () => void;
  isSendingTest: boolean;
}

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

const CHANNEL_LABEL: Record<NotifyChannel, string> = { telegram: 'Telegram', email: 'Email', in_app: 'App' };

/** What "automatic" means on the server: Telegram if it is paired, else the app. */
export function effectiveChannels(prefs: NotifyPrefsDTO | null, telegramLinked: boolean): NotifyChannel[] {
  if (prefs && prefs.channels.length > 0) return prefs.channels;
  return [telegramLinked ? 'telegram' : 'in_app'];
}

export function summarizePrefs(prefs: NotifyPrefsDTO, channels: NotifyChannel[]): string {
  const day = WEEKDAYS.find((d) => d.value === prefs.weekday)?.label ?? 'Monday';
  const when = prefs.frequency === 'weekly' ? `Every ${day}` : 'Every day';
  return `${when} at ${hourLabel(prefs.hour)} · ${channels.map((c) => CHANNEL_LABEL[c]).join(', ')}`;
}

/**
 * The Background Sync card's box. Shows only the essentials (is it on, when,
 * where); the choices open on demand and the explanation sits behind the info
 * icon, so the card stays quiet until the user wants to change something.
 */
export const BackgroundSyncPanel: React.FC<BackgroundSyncPanelProps> = ({
  linked,
  isLinking,
  onConnect,
  onDisconnect,
  telegramLinked,
  emailAvailable,
  accountEmail,
  prefs,
  prefsSaved,
  onChangePrefs,
  onSendTest,
  isSendingTest,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const current = prefs ?? { channels: [], frequency: 'daily' as const, hour: 7, weekday: 1, timezone: 'UTC' };
  const channels = effectiveChannels(prefs, telegramLinked);
  const canTest = channels.some((c) => (c === 'telegram' && telegramLinked) || (c === 'email' && emailAvailable));

  const toggleChannel = (channel: NotifyChannel) => {
    const toggled = channels.includes(channel) ? channels.filter((c) => c !== channel) : [...channels, channel];
    if (toggled.length === 0) return; // at least one way to hear from us
    const order: NotifyChannel[] = ['telegram', 'email', 'in_app'];
    const next = order.filter((c) => toggled.includes(c));
    onChangePrefs({ channels: next });
  };

  const options: Array<{ id: NotifyChannel; label: string; disabled: boolean; hint: string }> = [
    { id: 'telegram', label: 'Telegram', disabled: !telegramLinked, hint: telegramLinked ? 'Sent to your Telegram chat' : 'Connect Telegram first' },
    ...(emailAvailable ? [{ id: 'email' as const, label: 'Email', disabled: false, hint: `Sent to ${accountEmail}` }] : []),
    { id: 'in_app', label: 'App', disabled: false, hint: 'New events show as a notice when you open Ahead Of Time' },
  ];

  const selectClass =
    'px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 cursor-pointer';

  return (
    <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/70 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900">Background Sync</span>
              {linked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                  Active
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowInfo((v) => !v)}
                aria-label="What does this do?"
                aria-expanded={showInfo}
                title="What does this do?"
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>

            {!linked && (
              <p className="text-slate-600 text-[11px] mt-0.5">Stay ahead: approve automatic sync with your Google Calendar.</p>
            )}

            {linked && (
              <p className="text-slate-700 text-[11px] mt-0.5 font-medium">
                {prefsSaved ? (
                  <>
                    <span className="font-semibold text-slate-900">
                      {current.frequency === 'weekly' ? 'Weekly' : 'Daily'} update set
                    </span>{' '}
                    · {summarizePrefs(current, channels)}
                  </>
                ) : (
                  'Choose how and when you want your update.'
                )}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {linked ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-semibold rounded-lg border border-slate-200 text-xs transition cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={isLinking}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {isLinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>{isLinking ? 'Redirecting...' : 'Turn on'}</span>
            </button>
          )}
        </div>
      </div>

      {showInfo && (
        <p className="mt-2 ml-[42px] text-[11px] text-slate-600 leading-relaxed">
          We check your Google Calendar and your tasks and send one update on your schedule, even when the app is closed. It covers what needs
          attention, what is due this week, and new events with a prep plan. Events you add through Telegram also land in your Google Calendar
          and Tasks automatically.
        </p>
      )}

      {linked && (
        <div className="mt-2 ml-[42px]">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            aria-expanded={isEditing}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#182A42] hover:underline cursor-pointer"
          >
            {prefsSaved ? 'Change' : 'Choose preferences'}
            <ChevronDown className={`w-3 h-3 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
          </button>

          {isEditing && (
            <div className="mt-2 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white" role="group" aria-label="How often">
                  {(['daily', 'weekly'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onChangePrefs({ frequency: f })}
                      className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                        current.frequency === f ? 'bg-[#182A42] text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {f === 'daily' ? 'Daily' : 'Weekly'}
                    </button>
                  ))}
                </div>
                {current.frequency === 'weekly' && (
                  <select
                    aria-label="Day of the week"
                    value={current.weekday}
                    onChange={(e) => onChangePrefs({ weekday: Number(e.target.value) })}
                    className={selectClass}
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label="Time of day"
                  value={current.hour}
                  onChange={(e) => onChangePrefs({ hour: Number(e.target.value) })}
                  title={`Your local time (${current.timezone})`}
                  className={selectClass}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Where to send it">
                {options.map((opt) => {
                  const active = channels.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={opt.disabled}
                      title={opt.hint}
                      aria-pressed={active}
                      onClick={() => toggleChannel(opt.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#182A42] text-white border-[#182A42]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 stroke-[3]" />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {canTest && (
                <button
                  type="button"
                  onClick={onSendTest}
                  disabled={isSendingTest}
                  className="text-[11px] font-semibold text-slate-600 hover:text-[#182A42] underline underline-offset-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSendingTest ? 'Sending…' : 'Send me a test'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
