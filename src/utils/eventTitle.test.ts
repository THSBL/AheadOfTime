import { describe, it, expect } from 'vitest';
import { newEventTitle, isGenericTitle } from './eventTitle';

const ref = '2026-09-30T10:00:00Z';
const t = (message: string, eventDate: string, extra: Record<string, any> = {}) =>
  newEventTitle({ message, eventDate, referenceIso: ref, ...extra });

describe('new event titles: Where – What – When', () => {
  it('never uses a category label', () => {
    expect(isGenericTitle('Calendar Event')).toBe(true);
    expect(t('Dentist next Tuesday', '2026-10-06', { modelTitle: 'Upcoming Event', fallbackWhat: 'Calendar Event' })).toBe('Dentist – Tue 6 Oct');
  });
  it('takes the activity and place from the message', () => {
    expect(t('dinner with Sarah on Friday in Antwerp', '2026-10-02')).toBe('Antwerp – Dinner with Sarah – Fri 2 Oct');
    expect(t('I have a job interview on 14 October at Google in Brussels', '2026-10-14')).toBe('Brussels – Job interview at Google – Wed 14 Oct');
    expect(t('Dentist appointment next Tuesday at 10', '2026-10-06', { fallbackWhat: 'Dentist appointment  at 10' })).toBe('Dentist appointment – Tue 6 Oct');
  });
  it('keeps a specific model title and adds the dates of a trip', () => {
    expect(t('diving in egypt 3-10 dec', '2026-12-03', { modelTitle: 'Egypt Diving Trip', endDate: '2026-12-10', location: 'Egypt' })).toBe('Egypt Diving Trip – 3–10 Dec');
    expect(t('trip to amsterdam', '2026-11-02', { modelTitle: 'Trip to Amsterdam', location: 'Amsterdam' })).toBe('Amsterdam – Trip – Mon 2 Nov');
  });
});
