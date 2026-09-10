import { describe, it, expect } from 'vitest';
import { extractContextFromMessage, processWithDeterministicRules } from './agentProcessor';

const REF_DATE_ISO = '2026-09-01T12:00:00.000Z';
const REF_DATE_STR = '2026-09-01';

describe('extractContextFromMessage', () => {
  it('parses bracketed key:value tags', () => {
    const context = extractContextFromMessage('Party time [gift: group] [food: catering]');
    expect(context.giftType).toBe('group');
    expect(context.foodPlan).toBe('catering');
  });

  it('merges custom items instead of overwriting them', () => {
    const context = extractContextFromMessage('[customItems: balloons, cake]', { customItems: ['banner'] });
    expect(context.customItems).toEqual(expect.arrayContaining(['banner', 'balloons', 'cake']));
  });

  it('ignores prototype-polluting keys', () => {
    const context = extractContextFromMessage('[__proto__: evil] [constructor: evil]');
    expect(context).not.toHaveProperty('__proto__', 'evil');
    expect(Object.getPrototypeOf(context)).toBe(Object.prototype);
  });

  it('detects a speech/toast requirement mentioned in plain text', () => {
    const context = extractContextFromMessage('Need to prepare a speech for the reception');
    expect(context.neededItems).toEqual(expect.arrayContaining(['Speech']));
  });
});

describe('processWithDeterministicRules', () => {
  it('creates a trip event with a specific (non-generic) title', () => {
    // End-to-end regression test for the full "Fix generic Travel Trip
    // titles" bug chain, exercised through the actual deterministic
    // processing path (the one that runs in production when Gemini is
    // unavailable) rather than calling the title helper directly.
    const result = processWithDeterministicRules({
      message: 'Going to New York on October 15th with my wife. Need flights, hotel and a dog sitter.',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(result.event.title).toBe('Trip to New York');
    expect(result.event.title).not.toBe('Travel Trip');
  });

  it('parses the event date from a "<Title> on <date>" message', () => {
    const result = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(result.event.eventDate).toBe('2026-11-20');
  });

  it('generates at least one milestone for the created event', () => {
    const result = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(result.event.milestones.length).toBeGreaterThan(0);
  });

  it('resolves milestones instantly when an intake answer is supplied for an existing event', () => {
    const first = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    const second = processWithDeterministicRules({
      message: '',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: first.event,
      intakeAnswer: { questionId: 'q-1', parameterKey: 'giftType', answerValue: 'group' },
    });
    expect(second.event.context.giftType).toBe('group');
  });

  it('threads the userProfile home location into the event context (so tminusRules can consume it)', () => {
    const result = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      userProfile: { homeZipOrLocation: 'Brussels, Belgium' },
    });
    expect(result.event.context.homeZipOrLocation).toBe('Brussels, Belgium');
  });

  it('threads the userProfile home location through the hierarchical trip-decomposition path', () => {
    const result = processWithDeterministicRules({
      message: 'Weekend trip Friday to Sunday with activity for the 2nd day',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      userProfile: { homeZipOrLocation: 'Brussels, Belgium' },
    });
    expect(result.event.context.homeZipOrLocation).toBe('Brussels, Belgium');
  });
});
