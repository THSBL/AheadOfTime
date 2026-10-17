/**
 * The one place finder. Every title, trip check and question that needs
 * "where is this?" reads it from here, so a fix lands everywhere at once.
 *
 *   "Going to ibiza in august next year"   -> Ibiza   (not "August")
 *   "Family trip to Portugal in July 2027" -> Portugal
 *   "weekend in new york with Sam"         -> New York
 *   "going to the gym on Monday"           -> none
 *
 * A capitalised name after "to" / "in" is a place. A lowercase one only
 * counts right after a travel word ("trip to", "going to", "holiday in"),
 * so everyday words elsewhere are never read as a place. Dates, times and
 * ordinary words ("to work", "in August", "to see") never are.
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'januari', 'februari', 'maart', 'mei', 'juni', 'juli', 'augustus', 'oktober',
];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun'];
const TIME_WORDS = [
  'today', 'tonight', 'tomorrow', 'morning', 'afternoon', 'evening', 'night', 'noon', 'midnight', 'day', 'days', 'week', 'weeks', 'weekend',
  'month', 'months', 'year', 'years', 'summer', 'winter', 'spring', 'autumn', 'fall', 'time', 'advance', 'total', 'person', 'half',
  'next', 'this', 'that', 'these', 'those', 'early', 'mid', 'late', 'end', 'around', 'about', 'between', 'during',
  'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'few', 'couple',
];
/** Words that follow "to"/"in" in ordinary sentences: "to the gym", "going to be", "in case". */
const EVERYDAY = [
  'the', 'my', 'our', 'your', 'his', 'her', 'their', 'its', 'it', 'me', 'us', 'them', 'him', 'you', 'i', 'we', 'they', 'some', 'any', 'all',
  'be', 'bed', 'work', 'school', 'class', 'church', 'sleep', 'see', 'meet', 'have', 'do', 'get', 'go', 'come', 'make', 'plan', 'buy', 'book',
  'pick', 'visit', 'help', 'eat', 'cook', 'host', 'throw', 'watch', 'play', 'start', 'try', 'need', 'bring', 'take', 'celebrate', 'organise',
  'organize', 'move', 'stay', 'arrange', 'prepare', 'finish', 'call', 'ask', 'tell', 'pay', 'send', 'order', 'rent', 'hire', 'find', 'check',
  'dinner', 'lunch', 'breakfast', 'brunch', 'party', 'gym', 'store', 'shop', 'shops', 'doctor', 'dentist', 'hospital', 'office', 'town',
  'home', 'house', 'city', 'place', 'case', 'mind', 'touch', 'charge', 'front', 'person', 'total', 'style', 'order', 'abroad', 'there', 'here',
  'what', 'which', 'where', 'when', 'how', 'who', 'and', 'or', 'but', 'with', 'for', 'from', 'by', 'on', 'at', 'to', 'in', 'of', 'not',
];
const NOT_A_PLACE = new Set([...MONTHS, ...WEEKDAYS, ...TIME_WORDS, ...EVERYDAY]);

/** A place ends at the next joining word: "Ibiza with", "Lisbon from", "Paris in". */
const ENDS_PLACE = new Set(['from', 'with', 'for', 'on', 'in', 'at', 'to', 'by', 'and', 'or', 'during', 'this', 'next', 'around', 'early', 'mid', 'late', 'until', 'till', 'before', 'after', 'over', 'because', 'so', 'but', 'we', 'i', 'need', 'needs', 'must', 'should', 'have', 'has']);
/** Small words inside a name: "Rio de Janeiro", "Stratford upon Avon", "Den Haag". */
const NAME_JOINERS = new Set(['de', 'del', 'da', 'do', 'la', 'le', 'les', 'am', 'an', 'upon', 'aan', 'den', 'sur', 'en', 'y', 'of']);
/** Lowercase names of more than one word only start with one of these: "new york", "san sebastian", "costa rica". */
const MULTI_WORD_START = new Set(['new', 'san', 'santa', 'santo', 'los', 'las', 'el', 'la', 'le', 'costa', 'sri', 'south', 'north', 'east', 'west', 'saint', 'st', 'hong', 'buenos', 'rio', 'cape', 'tel', 'kuala', 'abu', 'puerto', 'port', 'lake', 'mount', 'isle', 'great', 'czech', 'united', 'sierra', 'den', 'monte', 'palma', 'gran']);

/** Travel words a lowercase place may follow: "trip to ibiza", "holiday in mallorca". */
const TRAVEL_LEAD = /\b(?:go|goes|going|went|gone|fly|flies|flying|flew|flight|flights|travel\w*|trip|trips|journey|heading|head|off|drive|driving|road ?trip|holiday|holidays|vacation|getaway|weekend|week|honeymoon|cruise|moving|move|visiting|staying|stay|ski(?:ing)?|camping|backpacking|retreat|break)\s*$/i;

const WORD = /[\p{L}][\p{L}'’.-]*/gu;
const isCapital = (w: string) => /^\p{Lu}/u.test(w);

/** US state codes at the end of a name: "brooklyn ny" -> "Brooklyn, NY". */
const US_STATE = /^(ny|ca|tx|fl|il|pa|oh|ga|nc|mi|nj|va|wa|az|ma|tn|in|mo|md|wi|co|mn|sc|al|la|ky|or|ok|ct|ut|ia|nv|ar|ms|ks|nm|ne|id|wv|hi|nh|me|ri|mt|de|sd|nd|ak|dc)$/i;

/** "brooklyn ny" -> "Brooklyn, NY"; "rio de janeiro" -> "Rio de Janeiro"; "ibiza" -> "Ibiza". */
export function tidyPlaceName(name: string): string {
  const words = String(name || '').trim().replace(/[,]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const last = words[words.length - 1];
  const state = words.length > 1 && US_STATE.test(last) ? last.toUpperCase() : null;
  const body = (state ? words.slice(0, -1) : words).map((w, i) =>
    i > 0 && NAME_JOINERS.has(w.toLowerCase()) && !isCapital(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  );
  return state ? `${body.join(' ')}, ${state}` : body.join(' ');
}

export interface PlaceMatch {
  /** Tidy name: "Ibiza", "New York". */
  place: string;
  /** The words as typed. */
  raw: string;
  /** Where "to ibiza" / "in New York" sits in the text, for cutting it out of a title. */
  index: number;
  length: number;
  /** Right after a travel word ("trip to", "going to", "holiday in"). */
  afterTravelWord: boolean;
}

function placeAt(text: string, index: number, lead: string): PlaceMatch | null {
  const after = text.slice(index + lead.length);
  const tokens: { w: string; end: number }[] = [];
  WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = WORD.exec(after)) && tokens.length < 5) {
    // Only spaces between the words of one name; a comma, digit or full stop ends it.
    if (tokens.length > 0 && !/^ +$/.test(after.slice(pos, m.index))) break;
    if (tokens.length === 0 && m.index !== 0) return null;
    tokens.push({ w: m[0].replace(/[.'’-]+$/, ''), end: m.index + m[0].replace(/[.'’-]+$/, '').length });
    pos = m.index + m[0].length;
  }
  if (tokens.length === 0) return null;
  const first = tokens[0].w;
  if (first.length < 2 || NOT_A_PLACE.has(first.toLowerCase())) return null;
  const travel = TRAVEL_LEAD.test(text.slice(0, index));
  const capital = isCapital(first);
  if (!capital && !travel) return null;

  let take = 1;
  for (let i = 1; i < tokens.length; i++) {
    const w = tokens[i].w;
    const lower = w.toLowerCase();
    if (ENDS_PLACE.has(lower) || MONTHS.includes(lower) || WEEKDAYS.includes(lower)) break;
    const joiner = NAME_JOINERS.has(lower) && i + 1 < tokens.length;
    const stateCode = i === take && w.length === 2 && US_STATE.test(w);
    if (capital) {
      // "New York", "Rio de Janeiro", "Brooklyn NY" - and "Lisbon with" stops.
      if (isCapital(w) && !NOT_A_PLACE.has(lower)) take = i + 1;
      else if (joiner && i === take) continue;
      else {
        if (stateCode) take = i + 1;
        break;
      }
    } else {
      // Lowercase: "new york", "rio de janeiro", "brooklyn ny" - never "ibiza girls trip".
      const startsName = MULTI_WORD_START.has(first.toLowerCase());
      if ((startsName && i <= 2 && !NOT_A_PLACE.has(lower)) || (joiner && startsName) || (i === take && US_STATE.test(w) && w.length === 2)) take = i + 1;
      else break;
    }
  }
  // A joiner never ends a name ("Rio de").
  while (take > 1 && NAME_JOINERS.has(tokens[take - 1].w.toLowerCase())) take--;
  const raw = after.slice(0, tokens[take - 1].end).trim();
  if (raw.length < 2) return null;
  return { place: tidyPlaceName(raw), raw, index, length: lead.length + tokens[take - 1].end, afterTravelWord: travel };
}

/** Every place in the text, in order. */
export function findPlaces(text: string | null | undefined): PlaceMatch[] {
  const s = String(text || '').replace(/\[[a-zA-Z0-9_-]+:\s*[^\]]*\]/g, (t) => ' '.repeat(t.length));
  const out: PlaceMatch[] = [];
  const lead = /\b(?:to|in)\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = lead.exec(s))) {
    const hit = placeAt(s, m.index, m[0]);
    if (hit) {
      out.push(hit);
      lead.lastIndex = m.index + hit.length;
    }
  }
  return out;
}

/** The place this is about: the one after a travel word first, else the first named one. */
export function findPlaceMatch(text: string | null | undefined): PlaceMatch | null {
  const all = findPlaces(text);
  return all.find((p) => p.afterTravelWord) || all[0] || null;
}

export function findPlace(text: string | null | undefined): string | null {
  return findPlaceMatch(text)?.place || null;
}

/** "going to ibiza", "holiday in Mallorca": travelling somewhere named. */
export function travelPlace(text: string | null | undefined): string | null {
  return findPlaces(text).find((p) => p.afterTravelWord)?.place || null;
}

/** A model or calendar location ("Portugal in", "brooklyn ny") as a tidy name; null for a date or empty. */
export function cleanPlaceName(place: string | null | undefined): string | null {
  const p = String(place || '').replace(/\s+(?:in|at|on|for|from|with|to|and)$/i, '').trim();
  if (!p || NOT_A_PLACE.has(p.toLowerCase())) return null;
  return tidyPlaceName(p);
}
