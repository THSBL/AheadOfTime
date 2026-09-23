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

  it('parses a natural-language date ("15 october"), not just ISO dates', () => {
    // Regression test: processWithDeterministicRules only ever matched
    // ISO dates when extracting the event date, so any natural phrasing
    // silently fell through to an unrelated placeholder-date fallback -
    // e.g. producing "22 September" for a message that said "15 October".
    const result = processWithDeterministicRules({
      message: 'Trip to Paris on 15 october',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(result.event.eventDate).toBe('2026-10-15');
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

  it('does not silently discard existing milestones (or their completed status) when an intake answer targets an existing event', () => {
    // Regression test for a real bug: answering an intake question or
    // retuning a structured variable on an existing event used to fall
    // straight through to a freshly regenerated, all-pending milestone
    // list, discarding whatever was already there - including anything the
    // user had already checked off.
    const first = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(first.event.milestones.length).toBeGreaterThan(0);
    const completedMilestone = { ...first.event.milestones[0], status: 'completed' as const, completedAt: '2026-09-05T00:00:00.000Z' };
    const existingEventWithProgress = {
      ...first.event,
      milestones: [completedMilestone, ...first.event.milestones.slice(1)],
    };

    const second = processWithDeterministicRules({
      message: '',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: existingEventWithProgress,
      intakeAnswer: { questionId: 'q-1', parameterKey: 'giftType', answerValue: 'group' },
    });

    const survivingMilestone = second.event.milestones.find((m) => m.id === completedMilestone.id);
    expect(survivingMilestone).toBeDefined();
    expect(survivingMilestone?.status).toBe('completed');
  });

  it('does not hijack a plain-text correction on an existing event into a fabricated new trip just because the word "trip" appears', () => {
    // Regression test for a real bug caught via live testing: the trip-
    // decomposition shortcut ran unconditionally before the existingEvent
    // merge logic, so a message merely containing the word "trip" (e.g. the
    // "Edit Event Details" form's own auto-generated "Changed the category
    // to Trip / Travel." description) matched it and replaced the entire
    // event with a fabricated, generically-titled "Group Trip Horizon" -
    // discarding the real event's identity, milestones, and completed
    // status outright, since that branch never looked at existingEvent.
    const first = processWithDeterministicRules({
      message: "Soccer Tournament Saturday on 2026-10-14",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(first.event.milestones.length).toBeGreaterThan(0);
    const completedMilestone = { ...first.event.milestones[0], status: 'completed' as const, completedAt: '2026-09-05T00:00:00.000Z' };
    const existingEventWithProgress = {
      ...first.event,
      milestones: [completedMilestone, ...first.event.milestones.slice(1)],
    };

    const second = processWithDeterministicRules({
      message: 'Changed the category to Trip / Travel.',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: existingEventWithProgress,
    });

    expect(second.event.title).toBe(existingEventWithProgress.title);
    expect(second.event.title).not.toBe('Group Trip Horizon');
    const survivingMilestone = second.event.milestones.find((m) => m.id === completedMilestone.id);
    expect(survivingMilestone).toBeDefined();
    expect(survivingMilestone?.status).toBe('completed');
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

describe('processWithDeterministicRules - preparation level (architecture reset Phase 6)', () => {
  it('computes and tags a fresh event with an AOT-owned preparation level', () => {
    const result = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(result.event.preparationLevelSetBy).toBe('aot');
    expect(['essentials', 'balanced', 'extensive']).toContain(result.event.preparationLevel);
    expect(result.event.milestones.every((m) => m.tier === result.event.preparationLevel)).toBe(true);
  });

  it('never overrides a user-set level, even when AOT would assess something different', () => {
    const first = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    const userLocked = {
      ...first.event,
      preparationLevel: 'extensive' as const,
      preparationLevelSetBy: 'user' as const,
      preparationLevelReasons: ['You chose this.'],
    };
    const second = processWithDeterministicRules({
      message: 'also need to send invitations',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: userLocked,
    });
    expect(second.event.preparationLevel).toBe('extensive');
    expect(second.event.preparationLevelSetBy).toBe('user');
    expect(second.event.preparationLevelReasons).toEqual(['You chose this.']);
  });

  it('tags the trip-decomposition early-return path too', () => {
    const result = processWithDeterministicRules({
      message: 'Weekend trip Friday to Sunday with activity for the 2nd day',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    expect(result.event.preparationLevel).toBeDefined();
    expect(result.event.milestones.every((m) => m.tier === result.event.preparationLevel)).toBe(true);
  });
});

describe('processWithDeterministicRules - planning context & locked facts (architecture reset Phase 7)', () => {
  it('records an explicit decline as a locked user_decision fact, and tags a non-empty planningContextVersion', () => {
    const result = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20, no cake needed",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    const declineEntry = Object.entries(result.event.planningContext || {}).find(([k]) => k.startsWith('decline_'));
    expect(declineEntry).toBeDefined();
    expect(declineEntry![1].provenance).toBe('user_decision');
    expect(result.event.planningContextVersion).toBeTruthy();
  });

  it('a locked decline survives an unrelated later correction unchanged, with a stable version', () => {
    const first = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20, no cake needed",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    const second = processWithDeterministicRules({
      message: 'also need balloons',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: first.event,
    });
    const firstDecline = Object.entries(first.event.planningContext || {}).find(([k]) => k.startsWith('decline_'));
    const secondDecline = Object.entries(second.event.planningContext || {}).find(([k]) => k.startsWith('decline_'));
    expect(secondDecline).toBeDefined();
    expect(secondDecline![1].provenance).toBe('user_decision');
    expect(secondDecline![1].value).toBe(firstDecline![1].value);
    expect(second.event.planningContextVersion).toBe(first.event.planningContextVersion);
  });

  it('strips a carried-over milestone that contradicts a locked decline from an earlier turn', () => {
    const base = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    const withDeclineAndGiftMilestone = {
      ...base.event,
      planningContext: {
        decline_gift: { value: 'No gift needed.', provenance: 'user_decision' as const, updatedAt: new Date().toISOString() },
      },
      milestones: [
        ...base.event.milestones,
        {
          id: 'ms-gift-manual',
          eventId: base.event.id,
          tMinusLabel: 'T-7d',
          tMinusOffsetMinutes: -10080,
          calculatedDate: '2026-11-13',
          title: 'Gift Purchased',
          description: 'Buy and wrap a birthday gift.',
          category: 'gift' as const,
          status: 'pending' as const,
        },
      ],
    };
    const result = processWithDeterministicRules({
      message: 'confirm the venue is booked',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: withDeclineAndGiftMilestone,
    });
    expect(result.event.milestones.some((m) => m.title === 'Gift Purchased')).toBe(false);
  });

  it('never strips a COMPLETED milestone even if it contradicts a locked decline made afterward', () => {
    const base = processWithDeterministicRules({
      message: "Maya's birthday party on 2026-11-20",
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
    });
    const withCompletedGiftMilestone = {
      ...base.event,
      planningContext: {
        decline_gift: { value: 'No gift needed.', provenance: 'user_decision' as const, updatedAt: new Date().toISOString() },
      },
      milestones: [
        ...base.event.milestones,
        {
          id: 'ms-gift-completed',
          eventId: base.event.id,
          tMinusLabel: 'T-7d',
          tMinusOffsetMinutes: -10080,
          calculatedDate: '2026-11-13',
          title: 'Gift Purchased',
          description: 'Buy and wrap a birthday gift.',
          category: 'gift' as const,
          status: 'completed' as const,
        },
      ],
    };
    const result = processWithDeterministicRules({
      message: 'confirm the venue is booked',
      refDateStr: REF_DATE_STR,
      refDateISO: REF_DATE_ISO,
      existingEvent: withCompletedGiftMilestone,
    });
    expect(result.event.milestones.some((m) => m.title === 'Gift Purchased' && m.status === 'completed')).toBe(true);
  });
});
