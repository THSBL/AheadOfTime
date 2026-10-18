/**
 * Occasions with a fixed date. "Halloween party" is on 31 October, not on
 * whatever date a planner guesses. Only single, unambiguous days: a bare
 * "Christmas" (a Christmas market trip, the office Christmas party) is left
 * alone; "Christmas Eve" / "Christmas Day" / "Christmas dinner" are not.
 */
const FIXED: Array<{ name: string; month: number; day: number; pattern: RegExp }> = [
  { name: 'Halloween', month: 10, day: 31, pattern: /\bhallowe'?en\b/i },
  { name: 'Bonfire Night', month: 11, day: 5, pattern: /\b(bonfire night|guy fawkes night)\b/i },
  { name: 'Sinterklaas', month: 12, day: 5, pattern: /\b(sinterklaas(avond)?|pakjesavond)\b/i },
  { name: 'Christmas Eve', month: 12, day: 24, pattern: /\bchristmas eve\b|\bkerstavond\b/i },
  { name: 'Christmas Day', month: 12, day: 25, pattern: /\bchristmas (day|dinner|lunch|morning)\b|\beerste kerstdag\b/i },
  { name: 'Boxing Day', month: 12, day: 26, pattern: /\bboxing day\b|\btweede kerstdag\b/i },
  { name: "New Year's Eve", month: 12, day: 31, pattern: /\bnew year'?s eve\b|\bnye\b|\boudejaars(avond|feest)\b|\bsilvester\b/i },
  { name: "New Year's Day", month: 1, day: 1, pattern: /\bnew year'?s day\b|\bnieuwjaarsdag\b/i },
  { name: "Galentine's Day", month: 2, day: 13, pattern: /\bgalentine'?s\b/i },
  { name: "Valentine's Day", month: 2, day: 14, pattern: /\bvalentine'?s?\b/i },
  { name: "St Patrick's Day", month: 3, day: 17, pattern: /\b(st\.?|saint) patrick'?s\b|\bpaddy'?s day\b/i },
  { name: "King's Day", month: 4, day: 27, pattern: /\bking'?s ?day\b|\bkoningsdag\b/i },
  { name: 'Independence Day', month: 7, day: 4, pattern: /\b(fourth|4th) of july\b|\bjuly (4|4th|fourth)\b/i },
];

export interface FixedOccasion {
  name: string;
  /** yyyy-mm-dd: the next time it comes round (today counts). */
  date: string;
  matchedText: string;
}

/** The fixed-date occasion this text is about, on its next date from `referenceIso`. */
export function fixedDateOccasion(text: string | null | undefined, referenceIso: string): FixedOccasion | null {
  const s = String(text || '');
  if (!s) return null;
  const ref = new Date(referenceIso);
  const today = isNaN(ref.getTime()) ? new Date() : ref;
  const todayIso = today.toISOString().slice(0, 10);
  for (const o of FIXED) {
    const m = s.match(o.pattern);
    if (!m) continue;
    let year = today.getUTCFullYear();
    let iso = `${year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
    if (iso < todayIso) {
      year += 1;
      iso = `${year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
    }
    return { name: o.name, date: iso, matchedText: m[0] };
  }
  return null;
}
