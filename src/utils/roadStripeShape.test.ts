import { describe, it, expect } from 'vitest';
import { buildRoadStripeClipPath, ROAD_STRIPE_SHAPES } from './roadStripeShape';

describe('buildRoadStripeClipPath', () => {
  it('returns a well-formed path() clip-path for a typical button size', () => {
    const result = buildRoadStripeClipPath(400, 72, ROAD_STRIPE_SHAPES[0]);
    expect(result.startsWith('path("')).toBe(true);
    expect(result.endsWith('")')).toBe(true);
    expect(result).toContain('M ');
    expect(result).toContain('Z');
  });

  it('never emits NaN even for a not-yet-measured (zero) size', () => {
    const result = buildRoadStripeClipPath(0, 0, ROAD_STRIPE_SHAPES[0]);
    expect(result).not.toContain('NaN');
  });

  it('never emits NaN for a very small/near-square button', () => {
    for (const shape of ROAD_STRIPE_SHAPES) {
      const result = buildRoadStripeClipPath(30, 28, shape);
      expect(result).not.toContain('NaN');
    }
  });

  it('produces a narrower top edge than bottom edge (the receding-road taper)', () => {
    const result = buildRoadStripeClipPath(400, 72, { topInsetRatio: 0.1, cornerRadius: 16, bow: 7 });
    // First point after "M " is the start of the top edge, inset from x=0.
    const firstX = Number(result.match(/M ([\d.]+)/)?.[1]);
    expect(firstX).toBeGreaterThan(0);
    expect(firstX).toBeLessThanOrEqual(400 * 0.1 + 16); // inset plus corner radius, generously
  });
});
