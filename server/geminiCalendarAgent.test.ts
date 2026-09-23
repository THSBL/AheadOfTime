import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same mocking pattern as agentProcessor.gemini.test.ts - exercises the real
// refine/merge branch logic without a live API key or network call.
let mockResponseText = '{}';
vi.mock('@google/genai', () => {
  function GoogleGenAI() {
    return {
      models: {
        generateContent: vi.fn().mockImplementation(async () => ({ text: mockResponseText })),
      },
    };
  }
  return { GoogleGenAI };
});

let recordedEvent: CalendarEvent | null = null;
vi.mock('./telegramStore.js', () => ({
  TelegramSessionStore: {
    getPendingClarification: vi.fn().mockResolvedValue(null),
    getOrCreateSession: vi.fn().mockResolvedValue({ lastCreatedEventId: undefined }),
    getRecentEventsForChat: vi.fn().mockResolvedValue([]),
    recordEventCreated: vi.fn().mockImplementation(async (_chatId: unknown, event: CalendarEvent) => {
      recordedEvent = event;
    }),
  },
}));

import { reconcileMilestoneDeliverables, GeminiCalendarAgent } from './geminiCalendarAgent';
import { TMinusMilestone, Deliverable, CalendarEvent } from '../src/types';

function makeMilestone(overrides: Partial<TMinusMilestone> = {}): TMinusMilestone {
  return {
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-14d',
    tMinusOffsetMinutes: -20160,
    calculatedDate: '2026-09-24',
    title: 'Untitled',
    category: 'logistics',
    status: 'pending',
    scope: 'macro',
    deliverables: [],
    ...overrides,
  };
}

function modelDeliverable(title: string): Deliverable {
  return { deliverable_id: 'del-model-1', title, type: 'coordination', is_completed: false };
}

describe('reconcileMilestoneDeliverables', () => {
  it('overrides mismatched model deliverables with topic-matched ones derived from the title', () => {
    // Regression test: a Telegram message covering both an international
    // trip and a kids' sports tournament could get the model to pair
    // football-kit deliverable text onto the passport milestone (and vice
    // versa) - this is the actual bug users saw ("Passport validity &
    // renewal check" milestone showing "Boots / cleats, shin guards..."
    // deliverables). The deterministic title-keyword matcher must win.
    const milestones = [makeMilestone({ id: 'passport', title: 'Passport validity & renewal check' })];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Clean uniform / jersey, shorts & socks packed in kit bag'), modelDeliverable('Boots / cleats, shin guards, filled water bottle & match snacks ready')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    expect(result[0].deliverables.map((d) => d.title)).not.toContain('Boots / cleats, shin guards, filled water bottle & match snacks ready');
    expect(result[0].deliverables.some((d) => d.title.toLowerCase().includes('passport'))).toBe(true);
  });

  it('does the same in the other direction: a football-kit milestone keeps football deliverables, not passport ones', () => {
    const milestones = [makeMilestone({ id: 'kit', title: 'Uniform & Shinguards Packed & Ready' })];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Passport validity verified'), modelDeliverable('Color scan / photo page copy stored securely offline')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    expect(result[0].deliverables.some((d) => d.title.toLowerCase().includes('passport'))).toBe(false);
    expect(result[0].deliverables.some((d) => d.title.toLowerCase().includes('shin guard') || d.title.toLowerCase().includes('cleat'))).toBe(true);
  });

  it('prefers the deterministic generic fallback over the model deliverables even for an uncategorized title', () => {
    // attachDeliverablesToMilestones always synthesizes at least one
    // title-derived deliverable via its own final catch-all branch, so in
    // practice the model-provided deliverables are never actually needed -
    // this locks that in as intended behavior (one authoritative source),
    // not an accident.
    const milestones = [makeMilestone({ id: 'custom', title: 'Confirm venue AV setup with the conference hall' })];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Test projector & microphone with venue staff')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    expect(result[0].deliverables.length).toBeGreaterThan(0);
    expect(result[0].deliverables.map((d) => d.title)).not.toContain('Test projector & microphone with venue staff');
  });

  it('keeps each milestone matched to its own title across a mixed multi-milestone list', () => {
    const milestones = [
      makeMilestone({ id: 'passport', title: 'Passport validity & renewal check' }),
      makeMilestone({ id: 'kit', title: 'Pack Uniform & Shinguards' }),
    ];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Boots / cleats, shin guards, filled water bottle & match snacks ready')]],
      [1, [modelDeliverable('Passport validity verified')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    const passportMilestone = result.find((m) => m.id === 'passport')!;
    const kitMilestone = result.find((m) => m.id === 'kit')!;
    expect(passportMilestone.deliverables.some((d) => d.title.toLowerCase().includes('passport'))).toBe(true);
    expect(kitMilestone.deliverables.some((d) => d.title.toLowerCase().includes('shin guard') || d.title.toLowerCase().includes('cleat'))).toBe(true);
  });
});

describe('GeminiCalendarAgent.refineEvent - completion preservation', () => {
  const OLD_ENV = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.GEMINI_API_KEY = OLD_ENV;
  });

  const makeEvent = (): CalendarEvent => ({
    id: 'evt-trip',
    title: 'Lisbon Trip',
    category: 'travel_trip',
    eventDate: '2026-11-01',
    status: 'milestones_active',
    context: {},
    milestones: [
      {
        id: 'ms-flights',
        eventId: 'evt-trip',
        tMinusLabel: 'T-21d',
        tMinusOffsetMinutes: -30240,
        calculatedDate: '2026-10-11',
        title: 'Flights & Hotel Booked',
        category: 'booking',
        status: 'completed',
        completedAt: '2026-09-01T10:00:00.000Z',
        slotKey: 'flights_hotel',
        deliverables: [],
      },
    ],
    updatedAt: new Date().toISOString(),
  } as CalendarEvent);

  it('does not un-complete a milestone the user already checked off, even when Gemini omits status', async () => {
    // Regression test: refineEvent previously called finalizeMilestonePlan
    // alone with no preserveCompletedMilestones pass, unlike every web-side
    // refinement path - a Telegram refinement could silently revert a
    // completed milestone back to pending.
    mockResponseText = JSON.stringify({
      type: 'event_creation',
      target_event_id: 'evt-trip',
      milestones: [
        {
          milestone_title: 'Flights & Hotel Booked',
          slot_key: 'flights_hotel',
          t_minus_days: 21,
          target_date: '2026-10-11',
          deliverables: ['Booking confirmed'],
        },
        {
          milestone_title: 'Rental Car Reserved',
          slot_key: 'rental_car',
          t_minus_days: 10,
          target_date: '2026-10-22',
          deliverables: ['Car booked'],
        },
      ],
      telegram_reply: 'Added a rental car task.',
    });

    const event = makeEvent();
    const result = await GeminiCalendarAgent.refineEvent(event, 'we also need a rental car', false);

    const flightsMilestone = result.mergedMilestones.find((m) => m.slotKey === 'flights_hotel');
    expect(flightsMilestone?.status).toBe('completed');
  });
});

describe('GeminiCalendarAgent.processMessage - deterministic fallback (no Gemini key)', () => {
  const OLD_ENV = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    recordedEvent = null;
  });
  afterEach(() => {
    process.env.GEMINI_API_KEY = OLD_ENV;
  });

  it('routes through the shared deterministic engine instead of the old isTrip-or-dinner_social binary template', async () => {
    // Regression coverage for the Phase 2 swap: intelligentNaturalLanguageEngine
    // used to hardcode every non-trip message as category "dinner_social"
    // with a 2-milestone template regardless of what it actually was.
    await GeminiCalendarAgent.processMessage('chat-1', 'Dentist appointment next Tuesday');

    expect(recordedEvent).not.toBeNull();
    expect(recordedEvent!.category).not.toBe('dinner_social');
    expect(recordedEvent!.milestones.length).toBeGreaterThan(0);
  });

  it('does not assume flights/hotel for a plain local event with no travel-mode evidence', async () => {
    await GeminiCalendarAgent.processMessage('chat-2', 'Soccer tournament Saturday');

    expect(recordedEvent).not.toBeNull();
    expect(recordedEvent!.milestones.some((m) => /flight|hotel/i.test(m.title))).toBe(false);
  });
});
