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

describe('titles never carry what still has to be done', () => {
  const R = '2026-10-01T10:00:00Z';
  const t = (message: string, eventDate: string, endDate?: string, modelTitle?: string) => newEventTitle({ message, eventDate, endDate, modelTitle, referenceIso: R });
  it('keeps where, the occasion with who, and when', () => {
    expect(t('Family trip to Portugal in July 2027 need to arrange flights, a car and a place to stay', '2027-07-01')).toBe('Portugal – Family trip – Jul 2027');
    expect(t('Need to arrange a weekend in Paris with my wife in November', '2026-11-06')).toBe('Paris – Weekend with my wife – Nov');
    expect(t('Going to Lisbon with the kids from 15 to 21 october and we still need to book a hotel', '2026-10-15', '2026-10-21')).toBe('Lisbon – Trip with the kids – 15–21 Oct');
    expect(t('I need to book a dentist appointment next Tuesday', '2026-10-06')).toBe('Dentist appointment – Tue 6 Oct');
    expect(t('Birthday party for Emma on 12 november, have to order a cake', '2026-11-12')).toBe('Birthday party for Emma – Thu 12 Nov');
  });
  it('cleans an AI title that lists tasks', () => {
    expect(t('Family trip to Portugal in July 2027 need to arrange flights', '2027-07-01', undefined, 'Family Trip to Portugal - Need to Arrange Flights & Car')).toBe('Portugal – Family trip – Jul 2027');
  });
});
