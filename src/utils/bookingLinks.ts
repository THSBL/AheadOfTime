/**
 * "Need help booking these?" - after a plan is made, one link per thing to
 * book, filled in with the plan's own place, dates and group size.
 *
 * Every address is built here, by code, from a fixed list of known sites:
 * never written by the AI and never taken from what anyone typed (a made-up
 * restaurant site, or a scam link slipped into a plan, can't get through).
 * What people typed only ever goes into a search parameter, encoded.
 *
 * Partner codes (affiliate ids) come from build settings; without one a
 * link is simply the plain link, so everything works before any sign-up.
 */
import type { CalendarEvent, TMinusMilestone } from '../types';
import { findPlace } from './place';

export type BookingKind = 'stay' | 'flights' | 'train' | 'car' | 'activity' | 'restaurant' | 'tickets' | 'gift' | 'party' | 'cake' | 'venue';

export interface BookingLink {
  label: string;
  url: string;
  /** Carries a partner code: shown with the disclosure line. */
  affiliate: boolean;
}

export interface BookingNeed {
  kind: BookingKind;
  /** "Where to stay", "Flights" */
  title: string;
  /** The plan step it comes from. */
  stepTitle: string;
  links: BookingLink[];
}

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'US', name: 'United States' },
];

const KINDS: Array<{ kind: BookingKind; title: string; pattern: RegExp }> = [
  { kind: 'flights', title: 'Flights', pattern: /\b(flights?|fly|flying|airline)\b/i },
  { kind: 'stay', title: 'Where to stay', pattern: /\b(stay|lodging|hotel|accommodation|airbnb|villa|apartment|room block|hostel|b&b|guest ?house)\b/i },
  { kind: 'train', title: 'Train', pattern: /\b(train|rail|eurostar|thalys)\b/i },
  { kind: 'car', title: 'Rental car', pattern: /\b(rental car|car rental|car hire|hire a car|rent a car)\b/i },
  { kind: 'activity', title: 'Things to do', pattern: /\b(activity|activities|excursion|tour|day trip|boat|experience|class|workshop)\b/i },
  { kind: 'restaurant', title: 'Restaurant', pattern: /\b(restaurants?|table for|book a table|reserve a table|dinner reservation|lunch reservation)\b/i },
  { kind: 'tickets', title: 'Tickets', pattern: /\b(tickets?|concert|festival|show|match|museum)\b/i },
  { kind: 'gift', title: 'Gift', pattern: /\b(gift|present)\b/i },
  { kind: 'party', title: 'Party supplies', pattern: /\b(decorations?|balloons?|party supplies|banner|tableware)\b/i },
  { kind: 'cake', title: 'Cake', pattern: /\b(cake|bakery|cupcakes?)\b/i },
  { kind: 'venue', title: 'Venue', pattern: /\b(venue|hall|location for)\b/i },
];

/** A step that is about booking or buying, not about deciding who comes or packing. */
const BOOKISH = /\b(book|booking|reserve|reservation|buy|order|rent|hire|tickets?|flights?|stay|lodging|hotel|venue|restaurant|gift|cake|activity|shortlist|compare|explore)\b/i;

const enc = encodeURIComponent;
const ymd = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '');

/** Partner codes, from build settings (empty until signed up). */
function partner(name: 'BOOKING' | 'GETYOURGUIDE' | 'BOL' | 'AMAZON'): string {
  try {
    const env = (import.meta as any).env || {};
    const v = String(env[`VITE_AFFILIATE_${name}`] || '').trim();
    return /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

function withPartner(url: string, param: string, id: string): BookingLink & { url: string } {
  return { label: '', url: id ? `${url}${url.includes('?') ? '&' : '?'}${param}=${enc(id)}` : url, affiliate: Boolean(id) };
}

function shop(country: string | undefined, query: string): BookingLink {
  const q = enc(query);
  switch (country) {
    case 'NL':
      return { ...withPartner(`https://www.bol.com/nl/nl/s/?searchtext=${q}`, 'partnerId', partner('BOL')), label: 'bol.com' };
    case 'BE':
      return { ...withPartner(`https://www.bol.com/be/nl/s/?searchtext=${q}`, 'partnerId', partner('BOL')), label: 'bol.com' };
    case 'GB':
      return { ...withPartner(`https://www.amazon.co.uk/s?k=${q}`, 'tag', partner('AMAZON')), label: 'Amazon' };
    case 'DE':
      return { ...withPartner(`https://www.amazon.de/s?k=${q}`, 'tag', partner('AMAZON')), label: 'Amazon' };
    case 'FR':
      return { ...withPartner(`https://www.amazon.fr/s?k=${q}`, 'tag', partner('AMAZON')), label: 'Amazon' };
    default:
      return { ...withPartner(`https://www.amazon.com/s?k=${q}`, 'tag', partner('AMAZON')), label: 'Amazon' };
  }
}

const maps = (what: string, where: string): BookingLink => ({
  label: 'Google Maps',
  url: `https://www.google.com/maps/search/${enc(where ? `${what} in ${where}` : what)}`,
  affiliate: false,
});

export interface BookingContext {
  country?: string;
  /** City or airport they fly from. */
  from?: string;
  /** Their home town, for local things (cake, venue) when the plan has no place. */
  home?: string;
}

/** How many people: the plan's guest count, else read from their words ("with 7 friends" is 8 of you). */
export function groupSize(event: Pick<CalendarEvent, 'title' | 'context'> & { rawInputSnippet?: string }): number {
  const n = Number(event.context?.guestCount);
  if (n > 0) return Math.min(30, Math.round(n));
  const m = `${event.rawInputSnippet || ''} ${event.title || ''}`.match(/\b(?:with|for)\s+(?:a\s+)?(?:group\s+of\s+)?(\d{1,2})\s+(friends|people|persons|guests|girls|boys|guys|ladies|lads|colleagues|adults)\b/i);
  if (!m) return 0;
  const count = Number(m[1]);
  // "with 7 friends" leaves out the one typing; "for 8 people" doesn't.
  return Math.min(30, /^(with)$/i.test(m[0].split(/\s+/)[0]) && !/people|persons|guests|adults/i.test(m[2]) ? count + 1 : count);
}

/** The links for one kind of booking. */
export function linksFor(kind: BookingKind, event: Pick<CalendarEvent, 'title' | 'eventDate' | 'endDate' | 'location' | 'context'> & { rawInputSnippet?: string }, ctx: BookingContext): BookingLink[] {
  const place = String(event.location || event.context?.destination || findPlace(event.title) || '').trim();
  const local = place || ctx.home || '';
  const start = ymd(event.eventDate);
  const end = ymd(event.endDate) || start;
  const people = groupSize(event);
  switch (kind) {
    case 'stay': {
      const b = withPartner(
        `https://www.booking.com/searchresults.html?ss=${enc(place)}${start ? `&checkin=${start}&checkout=${end}` : ''}${people ? `&group_adults=${people}` : ''}`,
        'aid',
        partner('BOOKING')
      );
      return [
        { ...b, label: 'Booking.com' },
        { label: 'Airbnb', url: `https://www.airbnb.com/s/${enc(place || 'homes')}/homes${start ? `?checkin=${start}&checkout=${end}${people ? `&adults=${people}` : ''}` : ''}`, affiliate: false },
      ];
    }
    case 'flights': {
      const q = `Flights to ${place}${ctx.from ? ` from ${ctx.from}` : ''}${start ? ` on ${start}` : ''}${end && end !== start ? ` through ${end}` : ''}`;
      return [
        { label: 'Google Flights', url: `https://www.google.com/travel/flights?q=${enc(q)}`, affiliate: false },
        { label: 'Skyscanner', url: ctx.country === 'GB' ? 'https://www.skyscanner.net/' : ctx.country === 'NL' ? 'https://www.skyscanner.nl/' : 'https://www.skyscanner.com/', affiliate: false },
      ];
    }
    case 'train':
      return ctx.country === 'NL' || ctx.country === 'BE'
        ? [{ label: 'NS International', url: 'https://www.nsinternational.com/', affiliate: false }, { label: 'Trainline', url: 'https://www.thetrainline.com/', affiliate: false }]
        : [{ label: 'Trainline', url: 'https://www.thetrainline.com/', affiliate: false }];
    case 'car':
      return [{ label: 'Rentalcars.com', url: 'https://www.rentalcars.com/', affiliate: false }];
    case 'activity': {
      const g = withPartner(`https://www.getyourguide.com/s/?q=${enc(place)}`, 'partner_id', partner('GETYOURGUIDE'));
      return [{ ...g, label: 'GetYourGuide' }, { label: 'Tripadvisor', url: `https://www.tripadvisor.com/Search?q=${enc(`things to do ${place}`.trim())}`, affiliate: false }];
    }
    case 'restaurant': {
      const book =
        ctx.country === 'GB' || ctx.country === 'US'
          ? { label: 'OpenTable', url: `https://www.opentable.com/s?term=${enc(local)}`, affiliate: false }
          : { label: 'TheFork', url: 'https://www.thefork.com/', affiliate: false };
      return [maps('restaurants', local), book];
    }
    case 'tickets':
      return [{ label: 'Ticketmaster', url: `https://www.ticketmaster.com/search?q=${enc(event.title)}`, affiliate: false }, maps('tickets', local)];
    case 'gift':
      return [shop(ctx.country, 'gift ideas')];
    case 'party':
      return [shop(ctx.country, 'party decorations')];
    case 'cake':
      return [maps('bakery', local)];
    case 'venue':
      return [maps('event venue', local)];
  }
}

/** What in this plan could use a booking link: one entry per kind, from its open steps. */
export function bookingNeeds(event: Pick<CalendarEvent, 'title' | 'eventDate' | 'endDate' | 'location' | 'context' | 'milestones'>, ctx: BookingContext): BookingNeed[] {
  const seen = new Set<BookingKind>();
  const needs: BookingNeed[] = [];
  const steps = (event.milestones || []).filter((m: TMinusMilestone) => m.isActive !== false && m.status !== 'completed' && m.status !== 'skipped');
  for (const m of steps) {
    const text = `${m.title} ${(m.deliverables || []).map((d) => d.title).join(' ')}`;
    if (!BOOKISH.test(text)) continue;
    for (const k of KINDS) {
      if (seen.has(k.kind) || !k.pattern.test(m.title)) continue;
      seen.add(k.kind);
      needs.push({ kind: k.kind, title: k.title, stepTitle: m.title, links: linksFor(k.kind, event, ctx) });
    }
  }
  const order: BookingKind[] = ['flights', 'train', 'stay', 'car', 'activity', 'restaurant', 'tickets', 'venue', 'cake', 'gift', 'party'];
  return needs.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 5);
}

/** The country, when we can tell: a saved answer, else the home location from onboarding. */
export function knownCountry(profile: { country?: string; homeZipOrLocation?: string } | null | undefined): string | undefined {
  if (profile?.country) return profile.country;
  const home = String(profile?.homeZipOrLocation || '').trim();
  if (!home) return undefined;
  if (/^\d{4}\s?[A-Z]{2}$/i.test(home) || /\b(netherlands|nederland|holland|amsterdam|rotterdam|utrecht|den haag|the hague|eindhoven)\b/i.test(home)) return 'NL';
  if (/\b(belgium|belgi[eë]|brussels|brussel|antwerp|antwerpen|ghent|gent|leuven)\b/i.test(home)) return 'BE';
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(home) || /\b(united kingdom|uk|england|scotland|wales|london|manchester)\b/i.test(home)) return 'GB';
  if (/\b(germany|deutschland|berlin|munich|m[uü]nchen|hamburg|cologne|k[oö]ln)\b/i.test(home)) return 'DE';
  if (/\b(france|paris|lyon|marseille)\b/i.test(home)) return 'FR';
  if (/^\d{5}(-\d{4})?$/.test(home) || /\b(usa|united states|new york|california|texas)\b/i.test(home)) return 'US';
  return undefined;
}
