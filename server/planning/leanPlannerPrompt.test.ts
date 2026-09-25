import { describe, it, expect, vi, afterEach } from 'vitest';

let mockResponseText = '{}';
const calls: any[] = [];
vi.mock('@google/genai', () => {
  function GoogleGenAI() {
    return {
      models: {
        generateContent: vi.fn().mockImplementation(async (args: any) => {
          calls.push(args);
          return { text: mockResponseText };
        }),
      },
    };
  }
  return { GoogleGenAI, Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', NUMBER: 'NUMBER' } };
});

import { selectPlannerPromptVariant, buildLeanSystemInstruction } from './leanPlannerPrompt';
import { processWithGemini } from '../agentProcessor';

describe('lean planner prompt', () => {
  afterEach(() => {
    delete process.env.PLANNER_PROMPT;
  });

  it('is off unless PLANNER_PROMPT=lean, and an explicit choice wins', () => {
    expect(selectPlannerPromptVariant()).toBe('full');
    process.env.PLANNER_PROMPT = 'lean';
    expect(selectPlannerPromptVariant()).toBe('lean');
    expect(selectPlannerPromptVariant('full')).toBe('full');
  });

  it('keeps the rules that exist for real mistakes, and the merge rules only when editing', () => {
    const base = { referenceDate: '2026-09-25', referenceDateLabel: 'Fri', preparationLevel: 'balanced' as const, lockedFactsBlock: '' };
    const fresh = buildLeanSystemInstruction({ ...base, hasExistingEvent: false });
    expect(fresh).toContain('TODAY is 2026-09-25');
    expect(fresh).toMatch(/ESTA/);
    expect(fresh).toMatch(/no-fly/);
    expect(fresh).toMatch(/never a bare category/);
    expect(fresh).not.toMatch(/EDITING AN EXISTING PLAN/);
    expect(fresh.length).toBeLessThan(4000);
    expect(buildLeanSystemInstruction({ ...base, hasExistingEvent: true })).toMatch(/never reset a completed task/);
  });

  it('sends the lean prompt and format, and the app reads the answer like the full one', async () => {
    process.env.GEMINI_API_KEY = 'test';
    calls.length = 0;
    mockResponseText = JSON.stringify({
      target_event_id: 'NEW',
      mode: 'RESOLVE_MILESTONES',
      event_title: 'Business Trip to New York',
      category: 'travel_trip',
      macro_event: { title: 'Business Trip to New York', start_date: '2026-10-19', end_date: '2026-10-23', destination: 'New York' },
      runway: [
        {
          milestone_title: 'Flights & Hotel Booked',
          slot_key: 'flights_hotel',
          t_minus_days: 28,
          target_date: '2026-09-21',
          status: 'pending',
          is_open_decision: false,
          deliverables: [{ title: 'Return flight BRU-JFK booked', type: 'booking', is_open_decision: false }],
        },
        {
          milestone_title: 'Expense Report Filed',
          slot_key: 'expenses',
          t_minus_days: -3,
          target_date: '2026-10-26',
          status: 'pending',
          is_open_decision: false,
          deliverables: [{ title: 'Receipts submitted', type: 'document', is_open_decision: false }],
        },
      ],
      focus: 'I planned your New York business trip for 19-23 Oct.',
      addition: '',
    });

    const result = await processWithGemini({
      message: 'Business trip to NYC for a presentation',
      currentReferenceDate: '2026-09-16T12:00:00.000Z',
      refDateStr: '2026-09-16',
      activeEvents: [],
      promptVariant: 'lean',
    });

    const planCall = calls[calls.length - 1];
    expect(planCall.config.systemInstruction.length).toBeLessThan(4000);
    expect(JSON.stringify(planCall.config.responseSchema)).not.toMatch(/sub_events|watchpoint|eventTitle/);
    expect(result.event.title).toBe('Business Trip to New York');
    expect(result.event.eventDate).toBe('2026-10-19');
    expect(result.event.endDate).toBe('2026-10-23');
    const titles = result.event.milestones.map((m) => m.title);
    expect(titles.some((t) => /Flights & Hotel/.test(t))).toBe(true);
    expect(titles.some((t) => /Expense Report/.test(t))).toBe(true);
  });
});
