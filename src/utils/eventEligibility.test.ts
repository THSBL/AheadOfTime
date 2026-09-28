import { describe, it, expect } from 'vitest';
import { assessCalendarEntry, trimToBirthdayReminderPlan, titleRuleKey, sanitizeScanPrefs } from './eventEligibility';

const a = (title: string, extra: Partial<Parameters<typeof assessCalendarEntry>[0]> = {}, prefs?: any) =>
  assessCalendarEntry({ title, daysAway: 14, ...extra }, prefs);

describe('which calendar entries get a plan', () => {
  it('leaves plain birthday reminders out, unless asked or the entry mentions prep', () => {
    expect(a('BDAY Anna')).toMatchObject({ kind: 'birthday_reminder', verdict: 'skip' });
    expect(a("Anna's birthday")).toMatchObject({ verdict: 'skip' });
    expect(a('🎂 Mila')).toMatchObject({ verdict: 'skip' });
    expect(a('BDAY Anna', {}, { birthdays: 'plan' })).toMatchObject({ kind: 'birthday_reminder', verdict: 'plan' });
    expect(a('BDAY Anna - gift')).toMatchObject({ kind: 'party', verdict: 'plan' });
    expect(a('Mila turns 8 - party')).toMatchObject({ kind: 'party', verdict: 'plan' });
  });

  it('skips public holidays but plans an actual holiday', () => {
    expect(a('Christmas Day')).toMatchObject({ kind: 'public_holiday', verdict: 'skip' });
    expect(a("King's Day")).toMatchObject({ verdict: 'skip' });
    expect(a('Easter Monday')).toMatchObject({ verdict: 'skip' });
    expect(a('Holiday in Crete')).toMatchObject({ kind: 'trip', verdict: 'plan' });
    expect(a('Holiday', { durationDays: 7 })).toMatchObject({ kind: 'trip', verdict: 'plan' });
    expect(a('Weekend in Lisbon')).toMatchObject({ kind: 'trip', verdict: 'plan' });
    expect(a('Christmas with the family in Leeds')).not.toMatchObject({ verdict: 'skip' });
  });

  it('treats medical as routine unless there is something to prepare', () => {
    expect(a('Dentist check-up')).toMatchObject({ kind: 'medical', verdict: 'skip' });
    expect(a('Knee surgery')).not.toMatchObject({ verdict: 'skip' });
    expect(a('Doctor - travel vaccinations')).toMatchObject({ kind: 'medical', verdict: 'plan' });
  });

  it('labels hosting, dinners, subscriptions and routines', () => {
    expect(a('Hosting the in-laws')).toMatchObject({ kind: 'hosting', verdict: 'plan' });
    expect(a('Dinner with Sam & Lucy')).toMatchObject({ kind: 'dinner', verdict: 'plan' });
    expect(a('Netflix renewal')).toMatchObject({ kind: 'subscription', verdict: 'unsure' });
    expect(a('Gym free trial ends')).toMatchObject({ kind: 'subscription', verdict: 'unsure' });
    expect(a('Team sync')).toMatchObject({ kind: 'routine', verdict: 'skip' });
    expect(a('Team sync', { calendarType: 'business' })).not.toMatchObject({ kind: 'routine' });
    expect(a('Haircut')).toMatchObject({ verdict: 'skip' });
  });

  it('kids: a tournament needs prep, weekly practice is a question', () => {
    expect(a('Football tournament')).toMatchObject({ kind: 'kids_activity', verdict: 'plan' });
    expect(a('Football practice')).toMatchObject({ verdict: 'unsure' });
  });

  it('vague titles are a question, and nothing is planned within 2 days', () => {
    expect(a('Tom')).toMatchObject({ kind: 'other', verdict: 'unsure' });
    expect(a('Weekend in Lisbon', { daysAway: 1 })).toMatchObject({ verdict: 'skip', reason: 'Too soon to prepare' });
  });
});

describe('birthday reminder plan', () => {
  it('keeps only the gift and card steps of a party plan', () => {
    const plan = ['Invitations & track RSVPs Sent', 'Birthday gift Ordered & Tracked', 'Party beverages run', 'Wrap gift & prepare birthday card'].map((title) => ({ title }));
    expect(trimToBirthdayReminderPlan(plan).map((m) => m.title)).toEqual(['Birthday gift Ordered & Tracked', 'Wrap gift & prepare birthday card']);
  });
});

describe('what the user taught us', () => {
  it('a rule for a kind of title relabels and decides', () => {
    const prefs = { birthdays: 'skip' as const, titleRules: [{ key: 'padel', kind: 'kids_activity' as const, verdict: 'skip' as const, example: 'Padel with Tom' }] };
    expect(assessCalendarEntry({ title: 'Padel with Sam', daysAway: 10 }, prefs)).toMatchObject({ kind: 'kids_activity', verdict: 'skip', reason: 'Your choice' });
  });

  it('a verdict for a whole kind applies to every entry of that kind, but never within 2 days', () => {
    const prefs = { birthdays: 'skip' as const, kindVerdicts: { subscription: 'skip' as const, dinner: 'skip' as const } };
    expect(assessCalendarEntry({ title: 'Netflix renewal', daysAway: 10 }, prefs)).toMatchObject({ verdict: 'skip' });
    expect(assessCalendarEntry({ title: 'Dinner with Sam', daysAway: 10 }, prefs)).toMatchObject({ verdict: 'skip' });
    const plan = { birthdays: 'skip' as const, kindVerdicts: { subscription: 'plan' as const } };
    expect(assessCalendarEntry({ title: 'Netflix renewal', daysAway: 1 }, plan)).toMatchObject({ verdict: 'skip' });
  });

  it('keys rules on the first meaningful word and cleans stored prefs', () => {
    expect(titleRuleKey('BDAY Anna')).toBe('bday');
    expect(titleRuleKey('The Padel match')).toBe('padel');
    expect(sanitizeScanPrefs({ birthdays: 'plan', kindVerdicts: { trip: 'skip', bogus: 'plan', dinner: 'maybe' }, titleRules: [{ key: 'X', kind: 'nope', verdict: 'plan' }] })).toEqual({
      birthdays: 'plan',
      kindVerdicts: { trip: 'skip' },
    });
  });
});
