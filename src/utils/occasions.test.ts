import { describe, expect, it } from 'vitest';
import { fixedDateOccasion } from './occasions';
import { parseNaturalDateRange } from './tminusRules';

const REF = '2026-10-18T10:00:00Z';

describe('fixed-date occasions', () => {
  it('Halloween is 31 October, this year while it is still to come', () => {
    expect(fixedDateOccasion('Halloween pumpkin carving gathering', REF)?.date).toBe('2026-10-31');
    expect(fixedDateOccasion('halloween party', '2026-11-02T10:00:00Z')?.date).toBe('2027-10-31');
  });
  it("New Year's Eve, Valentine's, Christmas Eve", () => {
    expect(fixedDateOccasion("NYE party at ours", REF)?.date).toBe('2026-12-31');
    expect(fixedDateOccasion("Valentine's dinner", REF)?.date).toBe('2027-02-14');
    expect(fixedDateOccasion('Christmas Eve with the in-laws', REF)?.date).toBe('2026-12-24');
  });
  it('a bare "Christmas" is not a date', () => {
    expect(fixedDateOccasion('Christmas market trip to Cologne', REF)).toBeNull();
    expect(fixedDateOccasion('office Christmas party', REF)).toBeNull();
  });
  it('the planner date parser uses it only when no other date is given', () => {
    expect(parseNaturalDateRange('Halloween pumpkin carving gathering for 10 kids', REF)?.startDate).toBe('2026-10-31');
    expect(parseNaturalDateRange('Halloween party on 24 October', REF)?.startDate).toBe('2026-10-24');
  });
});
