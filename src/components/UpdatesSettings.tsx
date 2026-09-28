import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { aiJsonHeaders } from '../services/aiRequest';
import { rowButtonClass } from './SettingsRow';

type Channel = 'telegram' | 'email' | 'in_app';
type Frequency = 'off' | 'daily' | 'weekly' | 'monthly';

interface Prefs {
  channels: Channel[];
  frequency: Frequency;
  hour: number;
  weekday: number;
  monthday: number;
  timezone: string;
}

interface State {
  prefs: Prefs;
  telegramLinked: boolean;
  emailAvailable: boolean;
  email: string;
  backgroundSyncLinked: boolean;
}

const FREQUENCIES: Array<{ id: Frequency; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MONTHDAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Channels as shown. Nothing chosen yet means "Telegram if paired, else the
 * app". The in-app notice only carries new calendar events, which need
 * Background Sync - without it that option isn't offered.
 */
function shownChannels(state: State): Channel[] {
  const allowed = (c: Channel) => c !== 'in_app' || state.backgroundSyncLinked;
  if (state.prefs.channels.length > 0) return state.prefs.channels.filter(allowed);
  if (state.telegramLinked) return ['telegram'];
  return state.backgroundSyncLinked ? ['in_app'] : [];
}

/**
 * Settings -> Updates: how often (off / daily / weekly / monthly), when,
 * and through which channels the prep update is sent. Saves each choice as
 * it is made (PUT /api/auth/notify-prefs); works without Background Sync.
 */
export const UpdatesSettings: React.FC = () => {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/notify-prefs', { headers: aiJsonHeaders(), cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setLoadError(res.status === 401 ? 'Sign in to choose your updates.' : 'Could not load your update settings.');
          return;
        }
        setState({
          prefs: data.prefs,
          telegramLinked: Boolean(data.telegramLinked),
          emailAvailable: Boolean(data.emailAvailable),
          email: data.email || '',
          backgroundSyncLinked: Boolean(data.backgroundSyncLinked),
        });
      })
      .catch(() => !cancelled && setLoadError('Could not load your update settings.'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic save; put the old value back if the server refuses.
  const change = async (partial: Partial<Prefs>) => {
    if (!state) return;
    const previous = state;
    const timezone = browserTimeZone();
    setState({ ...state, prefs: { ...state.prefs, ...partial, timezone } });
    setNotice(null);
    try {
      const res = await fetch('/api/auth/notify-prefs', {
        method: 'PUT',
        headers: aiJsonHeaders(),
        body: JSON.stringify({ prefs: { ...partial, timezone } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save that choice.');
      setState((s) => (s ? { ...s, prefs: data.prefs } : s));
    } catch (err: any) {
      setState(previous);
      setNotice({ tone: 'error', text: err?.message || 'Could not save that choice.' });
    }
  };

  const toggleChannel = (channel: Channel) => {
    if (!state) return;
    const current = shownChannels(state);
    const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
    if (next.length === 0) return; // at least one way to hear from us
    void change({ channels: (['telegram', 'email', 'in_app'] as Channel[]).filter((c) => next.includes(c)) });
  };

  const sendTest = async () => {
    setIsSendingTest(true);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/notify-prefs', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify({ sendTest: true }) });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        const where = (data.results || []).map((r: { channel: string }) => (r.channel === 'email' ? 'your inbox' : 'Telegram')).join(' and ');
        setNotice({ tone: 'ok', text: `Test sent to ${where}${data.usedSample ? ' (sample content: nothing needs attention yet)' : ''}.` });
      } else {
        setNotice({ tone: 'error', text: data.error || 'Could not send the test.' });
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not send the test.' });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (loadError) return <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-2xl p-4">{loadError}</p>;
  if (!state) {
    return (
      <div className="flex justify-center py-10 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const { prefs } = state;
  const isOff = prefs.frequency === 'off';
  const channels = shownChannels(state);
  const canTest = !isOff && channels.some((c) => (c === 'telegram' && state.telegramLinked) || (c === 'email' && state.emailAvailable));
  const selectClass = 'w-full bg-white text-slate-900 text-sm font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-400 cursor-pointer';

  const channelOptions: Array<{ id: Channel; label: string; disabled: boolean; hint: string }> = [
    { id: 'telegram', label: 'Telegram', disabled: !state.telegramLinked, hint: state.telegramLinked ? 'Sent to your Telegram chat' : 'Connect Telegram first (Connections)' },
    { id: 'email', label: 'Email', disabled: !state.emailAvailable, hint: state.emailAvailable ? `Sent to ${state.email}` : 'Email is not available yet' },
    ...(state.backgroundSyncLinked
      ? [{ id: 'in_app' as const, label: 'In the app', disabled: false, hint: 'New agenda events as a notice when you open Ahead Of Time' }]
      : []),
  ];
  const canDeliver = channelOptions.some((o) => !o.disabled);

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">Your prep update</p>
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs divide-y divide-slate-100">
        <div className="p-3.5 space-y-2">
          <p className="text-xs font-bold text-slate-600">How often</p>
          <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5" role="radiogroup" aria-label="How often">
            {FREQUENCIES.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={prefs.frequency === f.id}
                onClick={() => void change({ frequency: f.id })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  prefs.frequency === f.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {!isOff && (
          <>
            <div className="p-3.5 space-y-2">
              <p className="text-xs font-bold text-slate-600">When</p>
              <div className="flex gap-2">
                {prefs.frequency === 'weekly' && (
                  <select aria-label="Day of the week" value={prefs.weekday} onChange={(e) => void change({ weekday: Number(e.target.value) })} className={selectClass}>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>{WEEKDAYS[d]}</option>
                    ))}
                  </select>
                )}
                {prefs.frequency === 'monthly' && (
                  <select aria-label="Day of the month" value={prefs.monthday} onChange={(e) => void change({ monthday: Number(e.target.value) })} className={selectClass}>
                    {MONTHDAYS.map((d) => (
                      <option key={d} value={d}>{`The ${ordinal(d)}`}</option>
                    ))}
                  </select>
                )}
                <select aria-label="Time of day" value={prefs.hour} onChange={(e) => void change({ hour: Number(e.target.value) })} className={selectClass}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500">Your time zone: {browserTimeZone()}</p>
            </div>

            <div className="p-3.5 space-y-2">
              <p className="text-xs font-bold text-slate-600">Send it via</p>
              <div className="flex flex-wrap gap-1.5">
                {channelOptions.map((opt) => {
                  const active = channels.includes(opt.id) && !opt.disabled;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={opt.disabled}
                      title={opt.hint}
                      aria-pressed={active}
                      onClick={() => toggleChannel(opt.id)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        active ? 'bg-[#182A42] text-white border-[#182A42]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 stroke-[3]" />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {!canDeliver ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  Connect Telegram under Connections to receive your update.
                </p>
              ) : (
                !state.telegramLinked && <p className="text-[11px] text-slate-500">Telegram: connect it under Connections first.</p>
              )}
            </div>
          </>
        )}
      </div>

      {!isOff && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={sendTest} disabled={!canTest || isSendingTest} className={rowButtonClass}>
            {isSendingTest && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSendingTest ? 'Sending…' : 'Send a test'}</span>
          </button>
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-[#447463]" /> Saved automatically
          </span>
        </div>
      )}

      {notice && (
        <p
          className={`text-xs rounded-xl px-3 py-2 border ${
            notice.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.text}
        </p>
      )}

      <p className="text-[11px] text-slate-500 px-1 leading-relaxed">
        {isOff
          ? 'No updates are sent. Pick Daily, Weekly or Monthly to get what is due and anything late.'
          : `What's in it: what's due ${prefs.frequency === 'monthly' ? 'soon' : prefs.frequency === 'weekly' ? 'this week' : 'today and this week'}, anything late${
              state.backgroundSyncLinked ? ', and new events found in your agenda' : ''
            }.${state.backgroundSyncLinked ? '' : ' Turn on Background Sync to also hear about new events in your agenda.'}`}
      </p>
    </div>
  );
};
