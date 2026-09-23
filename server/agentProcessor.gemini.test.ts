import { describe, it, expect, vi } from 'vitest';

// Mocks the @google/genai SDK so processWithGemini's own branch logic can be
// exercised deterministically, without a real API key or network call - this
// exact function had zero test coverage before a real production data-loss
// bug slipped through it (see the test below).
let mockResponseText = '{}';
let lastGenerateContentCall: any = null;
vi.mock('@google/genai', () => {
  function GoogleGenAI() {
    return {
      models: {
        generateContent: vi.fn().mockImplementation(async (args: any) => {
          lastGenerateContentCall = args;
          return { text: mockResponseText };
        }),
      },
    };
  }
  return {
    GoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      ARRAY: 'ARRAY',
      STRING: 'STRING',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
    },
  };
});

import { processWithGemini } from './agentProcessor';
import type { CalendarEvent } from '../src/types';

const REF_DATE_ISO = '2026-09-16T12:00:00.000Z';
const REF_DATE_STR = '2026-09-16';

const makeExistingEvent = (): CalendarEvent => ({
  id: 'evt-dinner-curacao',
  title: 'Dinner in Curacao',
  category: 'dinner_social',
  eventDate: '2026-10-24',
  eventTime: '19:00',
  status: 'milestones_active',
  context: {},
  milestones: [
    {
      id: 'ms-1',
      eventId: 'evt-dinner-curacao',
      tMinusLabel: 'T-14d',
      tMinusOffsetMinutes: -20160,
      calculatedDate: '2026-10-10',
      title: 'Invites & confirm dietary requirements Sent',
      description: 'Gather RSVPs and note allergies',
      category: 'booking',
      status: 'pending',
      deliverables: [
        { deliverable_id: 'd1', title: 'Sent invitation links & RSVPs tracked', type: 'coordination', is_completed: false },
        { deliverable_id: 'd2', title: 'Confirmed headcount & dietary requirements noted', type: 'document', is_completed: false },
      ],
    },
    {
      id: 'ms-2',
      eventId: 'evt-dinner-curacao',
      tMinusLabel: 'T-3d',
      tMinusOffsetMinutes: -4320,
      calculatedDate: '2026-10-21',
      title: 'Grocery run & wine selection',
      description: 'Buy non-perishables, wine, table decor',
      category: 'shopping',
      status: 'pending',
      deliverables: [],
    },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('processWithGemini - preserving existing milestones when the model omits them', () => {
  it('does NOT wipe and regenerate the plan from a generic template when the model replies conversationally without populating runway/milestones', async () => {
    // Regression test for a real production data-loss bug: correcting an
    // existing event ("two guests are vegetarian") produced a confident
    // conversational reply, but the model's JSON left both `runway` and
    // `milestones` empty - and the code used to respond to that by
    // regenerating an entirely fresh, generic category-template plan,
    // silently discarding the real one (every custom deliverable, every
    // completed checkbox).
    mockResponseText = JSON.stringify({
      mode: 'RESOLVE_MILESTONES',
      target_event_id: 'evt-dinner-curacao',
      focus: 'Updated your dinner plan to account for two vegetarian guests.',
      addition: '',
      conversational_response: 'Noted two vegetarian guests.',
      // Deliberately no runway / macro_event / milestones fields.
    });

    const existingEvent = makeExistingEvent();
    const result = await processWithGemini({
      message: 'two guests are vegetarian',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      existingEvent,
      activeEvents: [existingEvent],
    });

    expect(result.event.milestones).toHaveLength(2);
    expect(result.event.milestones.map((m) => m.title)).toEqual(
      expect.arrayContaining(['Invites & confirm dietary requirements Sent', 'Grocery run & wine selection'])
    );
    // The event's own date/title must also survive untouched.
    expect(result.event.eventDate).toBe('2026-10-24');
    expect(result.event.title).toBe('Dinner in Curacao');
  });

  it('still uses the local category template for a genuinely brand-new event with no existingEvent and no model-provided plan', async () => {
    mockResponseText = JSON.stringify({
      mode: 'CREATE_AND_INTAKE',
      target_event_id: 'NEW',
      focus: 'Started planning your event.',
      addition: 'What else should I know?',
    });

    const result = await processWithGemini({
      message: "Maya's birthday party",
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      activeEvents: [],
    });

    expect(result.event.milestones.length).toBeGreaterThan(0);
  });

  it('falls back to the date named in the raw message, not today, when the model omits target_date on a brand-new event', async () => {
    // Regression test for a real, live-reported bug: "26 dec birthday
    // celebration brother" - terse phrasing with no "on"/punctuation - made
    // the model skip target_date in its JSON response entirely. The local
    // parseNaturalDateRange safety net (explicitMessageDate) was previously
    // only computed when existingEvent was present (a refinement turn), so
    // a fresh creation with no model-provided date fell all the way through
    // to params.refDateStr (today) instead of the date actually named in
    // the message - even though the local parser could extract it fine.
    mockResponseText = JSON.stringify({
      mode: 'CREATE_AND_INTAKE',
      target_event_id: 'NEW',
      event_title: "Brother's Birthday Celebration",
      focus: 'Started planning the celebration.',
      addition: 'What else should I know?',
    });

    const result = await processWithGemini({
      message: '26 dec birthday celebration brother',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      activeEvents: [],
    });

    expect(result.event.eventDate).toBe('2026-12-26');
  });

  it('trusts a date explicitly named in the raw message over a WRONG target_date the model confidently returns', async () => {
    // Regression test for a real, live-reported bug found right after the
    // fix above shipped: "Plan surprise party 23 october" sometimes got
    // back target_date: "2026-09-25" from the model - present, not
    // missing, so the previous fallback-only placement of
    // explicitMessageDate never got consulted and the wrong AI date won
    // outright. explicitMessageDate must now be checked FIRST, not last.
    mockResponseText = JSON.stringify({
      mode: 'CREATE_AND_INTAKE',
      target_event_id: 'NEW',
      event_title: 'Surprise Party',
      target_date: '2026-09-25', // wrong on purpose - simulates the observed bad model output
      focus: 'Started planning the surprise party.',
      addition: 'What else should I know?',
    });

    const result = await processWithGemini({
      message: 'Plan surprise party 23 october',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      activeEvents: [],
    });

    expect(result.event.eventDate).toBe('2026-10-23');
  });

  it('keeps the existing event title even when the model returns its own paraphrase alongside a refinement', async () => {
    // Regression test for a real, live-reported bug: correcting an existing
    // "Trip to Amsterdam" event with "no flights, we're going by train"
    // came back retitled "Travel & Vacation Trip" - the model's JSON schema
    // requires SOME title whenever it includes a macro_event/event_title,
    // even on a turn that never asked about the event's name at all. Once
    // an event already has a real title, the model's freshly-generated one
    // must never override it.
    mockResponseText = JSON.stringify({
      mode: 'RESOLVE_MILESTONES',
      target_event_id: 'evt-dinner-curacao',
      event_title: 'A Lovely Evening Out',
      focus: 'Noted.',
      addition: '',
      milestones: [
        { tMinusLabel: 'T-14d', tMinusOffsetMinutes: -20160, title: 'Invites & confirm dietary requirements Sent', category: 'booking' },
      ],
    });
    const existingEvent = makeExistingEvent();
    const result = await processWithGemini({
      message: 'two guests are vegetarian',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      existingEvent,
      activeEvents: [existingEvent],
    });
    expect(result.event.title).toBe('Dinner in Curacao');
  });

  it('tells the model which existing milestones are already completed', async () => {
    // The model was never told which milestones are already done, so a
    // correction touching one part of the plan could come back proposing
    // the whole thing fresh/pending - this asserts the actual payload sent
    // to Gemini now carries each milestone's real status, which the "never
    // revert a completed milestone" prompt rule (planningPipeline.ts)
    // depends on being there.
    mockResponseText = JSON.stringify({
      mode: 'RESOLVE_MILESTONES',
      target_event_id: 'evt-dinner-curacao',
      focus: 'Noted.',
      addition: '',
    });
    const existingEvent = makeExistingEvent();
    existingEvent.milestones[0].status = 'completed';

    await processWithGemini({
      message: 'two guests are vegetarian',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      existingEvent,
      activeEvents: [existingEvent],
    });

    expect(lastGenerateContentCall).toBeTruthy();
    const sentPrompt = JSON.parse(lastGenerateContentCall.contents[0].text);
    const sentMilestones = sentPrompt.existingTargetEvent.existingMilestones;
    expect(sentMilestones[0].status).toBe('completed');
    expect(sentMilestones[1].status).toBe('pending');
  });
});

describe('processWithGemini - preparation level (architecture reset Phase 6)', () => {
  it('tells the model which preparation level to plan at, and tags the returned milestones with it', async () => {
    mockResponseText = JSON.stringify({
      mode: 'RESOLVE_MILESTONES',
      target_event_id: 'NEW',
      focus: 'Created.',
      addition: '',
      runway: [{ milestone_title: 'Table Reserved', t_minus_days: 7, target_date: '2026-10-17', status: 'pending', deliverables: [] }],
    });

    const result = await processWithGemini({
      message: 'Dinner with friends next month',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      activeEvents: [],
    });

    expect(lastGenerateContentCall).toBeTruthy();
    expect(lastGenerateContentCall.config.systemInstruction).toMatch(/PLAN TO THE USER'S ACTUAL RESPONSIBILITY/);
    expect(result.event.preparationLevelSetBy).toBe('aot');
    expect(result.event.milestones.every((m) => m.tier === result.event.preparationLevel)).toBe(true);
  });

  it('never overrides a user-set preparation level, and the prompt reflects the locked level', async () => {
    mockResponseText = JSON.stringify({
      mode: 'RESOLVE_MILESTONES',
      target_event_id: 'evt-dinner-curacao',
      focus: 'Noted.',
      addition: '',
    });
    const existingEvent: CalendarEvent = {
      ...makeExistingEvent(),
      preparationLevel: 'extensive',
      preparationLevelSetBy: 'user',
      preparationLevelReasons: ['You chose this.'],
    };

    const result = await processWithGemini({
      message: 'two guests are vegetarian',
      currentReferenceDate: REF_DATE_ISO,
      refDateStr: REF_DATE_STR,
      existingEvent,
      activeEvents: [existingEvent],
    });

    expect(lastGenerateContentCall.config.systemInstruction).toContain('EXTENSIVE');
    expect(result.event.preparationLevel).toBe('extensive');
    expect(result.event.preparationLevelSetBy).toBe('user');
    expect(result.event.preparationLevelReasons).toEqual(['You chose this.']);
  });
});
