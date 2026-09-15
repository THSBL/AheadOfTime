import { describe, it, expect } from 'vitest';
import { resolveTargetEvent, buildCandidateEventIndex } from './planningPipeline';
import type { CalendarEvent } from '../src/types';

const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: overrides.id || 'evt-1',
  title: overrides.title || 'Party',
  category: overrides.category || 'birthday_party',
  eventDate: overrides.eventDate || '2026-11-20',
  status: 'milestones_active',
  context: {},
  milestones: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('resolveTargetEvent', () => {
  it('returns the currently-open event when the model targets it', () => {
    const eva = makeEvent({ id: 'evt-eva', title: "Eva's surprise party" });
    const activeEventsById = new Map([[eva.id, eva]]);
    const result = resolveTargetEvent({
      modelTargetEventId: 'evt-eva',
      candidateIds: [],
      currentlyOpenEventId: 'evt-eva',
      activeEventsById,
    });
    expect(result.isNew).toBe(false);
    expect(result.existingEvent?.id).toBe('evt-eva');
  });

  it('returns a different, offered candidate when the model names it by topic', () => {
    const eva = makeEvent({ id: 'evt-eva', title: "Eva's surprise party" });
    const rome = makeEvent({ id: 'evt-rome', title: 'Rome trip', category: 'travel_trip' });
    const activeEventsById = new Map([
      [eva.id, eva],
      [rome.id, rome],
    ]);
    const result = resolveTargetEvent({
      modelTargetEventId: 'evt-rome',
      candidateIds: ['evt-rome'],
      currentlyOpenEventId: 'evt-eva',
      activeEventsById,
    });
    expect(result.isNew).toBe(false);
    expect(result.existingEvent?.id).toBe('evt-rome');
  });

  it('never trusts a target_event_id that was not actually offered (hallucination guard) - falls back to the currently-open event', () => {
    const eva = makeEvent({ id: 'evt-eva', title: "Eva's surprise party" });
    const activeEventsById = new Map([[eva.id, eva]]);
    const result = resolveTargetEvent({
      modelTargetEventId: 'evt-made-up-id',
      candidateIds: [],
      currentlyOpenEventId: 'evt-eva',
      activeEventsById,
    });
    expect(result.isNew).toBe(false);
    expect(result.existingEvent?.id).toBe('evt-eva');
  });

  it('falls back to "NEW" when a hallucinated id is offered and there is no currently-open event', () => {
    const activeEventsById = new Map<string, CalendarEvent>();
    const result = resolveTargetEvent({
      modelTargetEventId: 'evt-made-up-id',
      candidateIds: [],
      currentlyOpenEventId: null,
      activeEventsById,
    });
    expect(result.isNew).toBe(true);
  });

  it('respects an explicit "NEW" even when an event is currently open', () => {
    const eva = makeEvent({ id: 'evt-eva', title: "Eva's surprise party" });
    const activeEventsById = new Map([[eva.id, eva]]);
    const result = resolveTargetEvent({
      modelTargetEventId: 'NEW',
      candidateIds: [],
      currentlyOpenEventId: 'evt-eva',
      activeEventsById,
    });
    expect(result.isNew).toBe(true);
  });

  it('converges on one event across two sequential calls with the same candidates - the direct regression test for the duplicate-events bug', () => {
    const eva = makeEvent({ id: 'evt-eva', title: "Eva's surprise party" });
    const activeEventsById = new Map([[eva.id, eva]]);

    const first = resolveTargetEvent({
      modelTargetEventId: 'evt-eva',
      candidateIds: [],
      currentlyOpenEventId: 'evt-eva',
      activeEventsById,
    });
    const second = resolveTargetEvent({
      modelTargetEventId: 'evt-eva',
      candidateIds: [],
      currentlyOpenEventId: 'evt-eva',
      activeEventsById,
    });

    expect(first.existingEvent?.id).toBe(second.existingEvent?.id);
    expect(first.isNew).toBe(false);
    expect(second.isNew).toBe(false);
  });

  it('returns "NEW" when there is no hint and the model returns garbage', () => {
    const activeEventsById = new Map<string, CalendarEvent>();
    const result = resolveTargetEvent({
      modelTargetEventId: undefined,
      candidateIds: [],
      currentlyOpenEventId: undefined,
      activeEventsById,
    });
    expect(result.isNew).toBe(true);
  });
});

describe('buildCandidateEventIndex', () => {
  it('excludes milestone bodies and the excluded id, keeping only id/title/category/dates', () => {
    const eva = makeEvent({ id: 'evt-eva', title: "Eva's surprise party" });
    const rome = makeEvent({ id: 'evt-rome', title: 'Rome trip', category: 'travel_trip', endDate: '2026-12-05' });
    const index = buildCandidateEventIndex([eva, rome], 'evt-eva');
    expect(index).toEqual([
      { id: 'evt-rome', title: 'Rome trip', category: 'travel_trip', eventDate: '2026-11-20', endDate: '2026-12-05' },
    ]);
  });
});
