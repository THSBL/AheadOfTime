import React, { useMemo, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { useUserProfile } from '../contexts/UserProfileContext';
import { COUNTRIES, bookingNeeds, knownCountry } from '../utils/bookingLinks';

/**
 * "Need help booking these?" - shown once on a plan right after it was made
 * in the chat (context.bookingHelp === 'offer'), never during planning.
 * Asks only what it needs and doesn't know yet: the country (for the right
 * shops) and, with flights, where they fly from. Answers go in the profile,
 * so the next plan doesn't ask again. Links come from bookingLinks.ts only.
 */
export const BookingHelp: React.FC<{ event: CalendarEvent; onDone: () => void }> = ({ event, onDone }) => {
  const { profile, saveProfile } = useUserProfile();
  const [countryPick, setCountryPick] = useState<string>('');
  const [fromInput, setFromInput] = useState<string>('');
  const country = knownCountry(profile) || countryPick || undefined;
  const from = profile?.homeAirport || '';
  const needs = useMemo(
    () => bookingNeeds(event, { country, from: from || undefined, home: profile?.homeZipOrLocation }),
    [event, country, from, profile?.homeZipOrLocation]
  );
  if (needs.length === 0) return null;
  const hasFlights = needs.some((n) => n.kind === 'flights');
  const askCountry = !knownCountry(profile);
  const askFrom = hasFlights && !from;
  const saveCountry = (code: string) => {
    setCountryPick(code);
    saveProfile({ ...(profile || {}), country: code });
  };
  const saveFrom = () => {
    const v = fromInput.trim().slice(0, 60);
    if (v) saveProfile({ ...(profile || {}), ...(country ? { country } : {}), homeAirport: v });
  };
  const anyAffiliate = needs.some((n) => n.links.some((l) => l.affiliate));

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 aot-rise" aria-label="Help with bookings">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your plan is ready</p>
          <h4 className="text-sm font-black text-slate-900">Need help booking {needs.map((n) => n.title.toLowerCase()).slice(0, 3).join(', ')}?</h4>
        </div>
        <button type="button" onClick={onDone} aria-label="No thanks" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {askCountry && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-700">Where do you live? Then we show the right shops.</p>
          <div className="flex flex-wrap gap-1.5">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                aria-pressed={countryPick === c.code}
                onClick={() => saveCountry(c.code)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer ${
                  countryPick === c.code ? 'bg-[#182A42] text-white border-[#182A42]' : 'bg-white text-slate-700 border-slate-200 hover:border-[#95BFB5]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {askFrom && (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            saveFrom();
          }}
        >
          <label htmlFor={`from-${event.id}`} className="text-xs font-bold text-slate-700 block">
            Where are you flying from?
          </label>
          <div className="flex gap-2">
            <input
              id={`from-${event.id}`}
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              maxLength={60}
              placeholder="e.g. Amsterdam or AMS"
              className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-slate-400"
            />
            <button type="submit" disabled={!fromInput.trim()} className="text-xs font-bold px-3 py-2 rounded-lg bg-[#182A42] text-white disabled:opacity-40 cursor-pointer">
              Save
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-slate-100">
        {needs.map((n) => (
          <li key={n.kind} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800">{n.title}</p>
              <p className="text-[11px] text-slate-400 truncate">{n.stepTitle}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {n.links.map((l) => (
                <a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel={l.affiliate ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#E6F2EE] text-slate-700 hover:text-emerald-900"
                >
                  {l.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-slate-400">{anyAffiliate ? 'Some links earn us a small fee, at no cost to you.' : 'Links open the site in a new tab.'}</p>
        <button type="button" onClick={onDone} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer">
          No thanks
        </button>
      </div>
    </section>
  );
};
