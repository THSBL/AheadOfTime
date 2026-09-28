import { normalizedTitle, titleRuleKey, type EntryKind, type ScanPrefs, type ScanVerdict, type TitleRule } from './eventEligibility.js';

export interface TaughtAnswer {
  title: string;
  /** What we guessed. */
  guessedKind: EntryKind;
  /** What the user settled on. */
  kind: EntryKind;
  verdict: ScanVerdict;
}

/**
 * Turns Teach Ahead Of Time answers into rules:
 * - a corrected label, or anything we could only call "Other", becomes a
 *   rule for that kind of title ("padel" -> hobby, leave out);
 * - a birthday answer sets the birthday choice;
 * - otherwise the answer applies to the whole kind ("plan things like this").
 */
export function learnFromAnswers(prefs: ScanPrefs, answers: TaughtAnswer[], now = new Date()): ScanPrefs {
  const next: ScanPrefs = {
    ...prefs,
    kindVerdicts: { ...(prefs.kindVerdicts || {}) },
    titleRules: [...(prefs.titleRules || [])],
    lastTeachAt: now.toISOString(),
  };
  for (const a of answers) {
    const corrected = a.kind !== a.guessedKind;
    // A corrected label applies to titles starting with the same word
    // ("Padel ..."); a vague title we couldn't place applies to itself only
    // ("Tom" must not catch "Tom's birthday").
    const exact = !corrected;
    const key = exact ? normalizedTitle(a.title) : titleRuleKey(a.title);
    if ((corrected || a.kind === 'other') && key) {
      const rule: TitleRule = { key, ...(exact ? { exact: true } : {}), kind: a.kind, verdict: a.verdict, example: a.title.slice(0, 80) };
      next.titleRules = [...next.titleRules!.filter((r) => !(r.key === key && Boolean(r.exact) === exact)), rule];
      continue;
    }
    if (a.kind === 'birthday_reminder') {
      next.birthdays = a.verdict === 'plan' ? 'plan' : 'skip';
      continue;
    }
    next.kindVerdicts![a.kind] = a.verdict;
  }
  if (!next.titleRules!.length) delete next.titleRules;
  if (!Object.keys(next.kindVerdicts!).length) delete next.kindVerdicts;
  return next;
}
