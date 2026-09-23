import { describe, it, expect } from 'vitest';
import {
  mergePlanningContext,
  computePlanningContextVersion,
  extractLockedFacts,
  detectDeclineFacts,
} from './planningContext';
import type { PlanningContextEntry } from '../types';

function entry(value: unknown, provenance: PlanningContextEntry['provenance'], updatedAt = '2026-01-01T00:00:00.000Z'): PlanningContextEntry {
  return { value, provenance, updatedAt };
}

describe('mergePlanningContext', () => {
  it('a locked (user_stated/user_decision) entry is never overwritten by an ai_inferred one for the same key', () => {
    const existing = { gift: entry('no gift needed', 'user_decision') };
    const incoming = { gift: entry('a scarf', 'ai_inferred') };
    const merged = mergePlanningContext(existing, incoming);
    expect(merged.gift.value).toBe('no gift needed');
    expect(merged.gift.provenance).toBe('user_decision');
  });

  it('a fresh user_stated/user_decision entry always overwrites an existing locked one (a genuine correction)', () => {
    const existing = { destination: entry('Paris', 'user_stated') };
    const incoming = { destination: entry('Rome', 'user_stated') };
    const merged = mergePlanningContext(existing, incoming);
    expect(merged.destination.value).toBe('Rome');
  });

  it('an ai_inferred entry freely updates another ai_inferred/ai_generated entry', () => {
    const existing = { mood: entry('festive', 'ai_generated') };
    const incoming = { mood: entry('relaxed', 'ai_inferred') };
    const merged = mergePlanningContext(existing, incoming);
    expect(merged.mood.value).toBe('relaxed');
  });

  it('a genuinely new key is simply added', () => {
    const merged = mergePlanningContext({ a: entry(1, 'user_stated') }, { b: entry(2, 'ai_inferred') });
    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
  });
});

describe('computePlanningContextVersion', () => {
  it('is empty when there are no locked entries', () => {
    expect(computePlanningContextVersion({ x: entry('y', 'ai_inferred') })).toBe('');
    expect(computePlanningContextVersion(undefined)).toBe('');
  });

  it('changes when a locked value changes', () => {
    const v1 = computePlanningContextVersion({ role: entry('organizer', 'user_decision') });
    const v2 = computePlanningContextVersion({ role: entry('participant', 'user_decision') });
    expect(v1).not.toBe(v2);
  });

  it('does NOT change when only an ai_inferred/ai_generated entry changes - prose variation must never bump the version', () => {
    const base = { role: entry('organizer', 'user_decision') };
    const v1 = computePlanningContextVersion({ ...base, notes: entry('draft A', 'ai_generated') });
    const v2 = computePlanningContextVersion({ ...base, notes: entry('draft B, totally different wording', 'ai_generated') });
    expect(v1).toBe(v2);
  });

  it('is stable regardless of key insertion order', () => {
    const a = { z: entry(1, 'user_stated'), a: entry(2, 'user_decision') };
    const b = { a: entry(2, 'user_decision'), z: entry(1, 'user_stated') };
    expect(computePlanningContextVersion(a)).toBe(computePlanningContextVersion(b));
  });
});

describe('extractLockedFacts', () => {
  it('returns only user_decision entries, not user_stated/ai_* ones', () => {
    const context = {
      decline_cake: entry('No cake needed.', 'user_decision'),
      destination: entry('Rome', 'user_stated'),
      mood: entry('festive', 'ai_inferred'),
    };
    expect(extractLockedFacts(context)).toEqual({ decline_cake: 'No cake needed.' });
  });

  it('is empty for undefined context', () => {
    expect(extractLockedFacts(undefined)).toEqual({});
  });
});

describe('detectDeclineFacts', () => {
  it('detects "no X needed"', () => {
    const facts = detectDeclineFacts('no cake needed for this one, just drinks');
    expect(facts.some((f) => f.term === 'cake')).toBe(true);
  });

  it('detects "skip the X"', () => {
    const facts = detectDeclineFacts('skip the invitations, it is a surprise');
    expect(facts.some((f) => f.term.includes('invitations'))).toBe(true);
  });

  it('detects "we are not doing a X"', () => {
    const facts = detectDeclineFacts("we're not doing a gift this year");
    expect(facts.some((f) => f.term.includes('gift'))).toBe(true);
  });

  it('produces a stable, reusable key for the same term across calls', () => {
    const first = detectDeclineFacts('no cake needed');
    const second = detectDeclineFacts('no cake needed, we already talked about it');
    expect(first[0].key).toBe(second[0].key);
  });

  it('returns nothing for plain, non-declining text', () => {
    expect(detectDeclineFacts('book flights and a hotel for the Rome trip')).toEqual([]);
  });
});
