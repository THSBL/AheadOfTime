import { describe, it, expect } from 'vitest';
import {
  cleanReminderPrefs,
  defaultEveryoneStepIds,
  fixedMoments,
  googleAddLink,
  nextUpStep,
  outlookAddLink,
  shareMessage,
  upcomingSteps,
  webcalUrl,
} from './planLink';

describe('fixedMoments (what the app puts in as events)', () => {
  it('a trip with a return date has a departure and a return', () => {
    expect(
      fixedMoments({ title: 'Lisbon', category: 'travel_trip', eventDate: '2026-12-20', endDate: '2026-12-27', eventTime: '07:15', context: { returnTime: '18:40' } })
    ).toEqual([
      { key: 'departure', title: 'Departure: Lisbon', date: '2026-12-20', time: '07:15' },
      { key: 'return', title: 'Return: Lisbon', date: '2026-12-27', time: '18:40' },
    ]);
  });

  it('anything else is the day itself, over several days when it spans them', () => {
    expect(fixedMoments({ title: 'Secret Santa', category: 'party' as any, eventDate: '2026-12-20', eventTime: '18:00', context: {} })).toEqual([
      { key: 'event', title: 'Secret Santa', date: '2026-12-20', time: '18:00' },
    ]);
    expect(fixedMoments({ title: 'Festival', category: 'party' as any, eventDate: '2026-07-10', endDate: '2026-07-12', context: {} })).toEqual([
      { key: 'event', title: 'Festival', date: '2026-07-10', endDate: '2026-07-12', time: undefined },
    ]);
  });

  it('no date, no moments', () => {
    expect(fixedMoments({ title: 'X', category: 'party' as any, eventDate: 'soon', context: {} })).toEqual([]);
  });
});

describe('cleanReminderPrefs', () => {
  it('keeps a valid choice and falls back for anything else', () => {
    expect(cleanReminderPrefs({ style: 'events', time: '08:30', minutes: 60 })).toEqual({ style: 'events', time: '08:30', minutes: 60 });
    expect(cleanReminderPrefs({ style: 'weird', time: '25h', minutes: 7 })).toEqual({ style: 'tasks', time: '19:00', minutes: 30 });
    expect(cleanReminderPrefs(null)).toEqual({ style: 'tasks', time: '19:00', minutes: 30 });
  });
});

describe('what guests see', () => {
  const milestones: any[] = [
    { id: 'a', title: 'Invite everyone, agree the budget', calculatedDate: '2026-11-07T09:00:00', status: 'pending' },
    { id: 'b', title: 'Wishlists in', calculatedDate: '2026-11-22', status: 'pending' },
    { id: 'c', title: 'Buy and wrap your gift', calculatedDate: '2026-12-06', status: 'pending' },
    { id: 'd', title: 'Hidden', calculatedDate: '2026-12-07', status: 'pending', isActive: false },
    { id: 'e', title: 'Seating plan', calculatedDate: '2026-12-10', status: 'pending', applicableRoles: ['guest'] },
  ];

  it('starts with the steps that concern everyone marked "Everyone"', () => {
    expect(defaultEveryoneStepIds({ milestones })).toEqual(['b', 'c', 'e']);
  });

  it('next up is the first open step from today on', () => {
    const steps = [
      { title: 'Past', date: '2026-11-01', done: false },
      { title: 'Done', date: '2026-11-21', done: true },
      { title: 'Wishlists in', date: '2026-11-22', done: false },
      { title: 'Gift', date: '2026-12-06', done: false },
    ];
    expect(nextUpStep(steps, '2026-11-10')?.title).toBe('Wishlists in');
    expect(upcomingSteps(steps, '2026-11-10').map((s) => s.title)).toEqual(['Wishlists in', 'Gift']);
    expect(nextUpStep(steps, '2026-12-07')).toBeNull();
  });

  it('the message is the call to action, a blank line, then the link', () => {
    expect(shareMessage('https://aheadoftime.app/p/abc', 3)).toBe('Tap to add this event and 3 more reminders to your calendar:\n\nhttps://aheadoftime.app/p/abc');
    expect(shareMessage('L', 1)).toBe('Tap to add this event and 1 more reminder to your calendar:\n\nL');
    expect(shareMessage('L', 0)).toBe('Tap to add this event to your calendar:\n\nL');
  });
});

describe('one-tap calendar links', () => {
  it('Google: an all-day step ends the next day; a timed event has its length', () => {
    const allDay = new URL(googleAddLink({ title: 'Wishlists in', date: '2026-11-22' }));
    expect(allDay.searchParams.get('dates')).toBe('20261122/20261123');
    const timed = new URL(googleAddLink({ title: 'Secret Santa', date: '2026-12-20', time: '18:00', minutes: 120 }));
    expect(timed.searchParams.get('dates')).toBe('20261220T180000/20261220T200000');
    expect(timed.searchParams.get('text')).toBe('Secret Santa');
  });

  it('Outlook: all-day flag or start and end times', () => {
    const allDay = new URL(outlookAddLink({ title: 'Festival', date: '2026-07-10', endDate: '2026-07-12' }));
    expect(allDay.searchParams.get('allday')).toBe('true');
    expect(allDay.searchParams.get('enddt')).toBe('2026-07-13');
    const timed = new URL(outlookAddLink({ title: 'Flight', date: '2026-12-20', time: '23:30', minutes: 60 }));
    expect(timed.searchParams.get('startdt')).toBe('2026-12-20T23:30:00');
    expect(timed.searchParams.get('enddt')).toBe('2026-12-21T00:30:00');
  });

  it('webcal for a subscription', () => {
    expect(webcalUrl('https://aheadoftime.app/api/plan/feed/x.ics')).toBe('webcal://aheadoftime.app/api/plan/feed/x.ics');
  });
});
