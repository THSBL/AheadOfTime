import { describe, it, expect } from 'vitest';
import { computeWeekProgress } from './readiness';

const ref = '2026-09-28T10:00:00.000Z';
const ms = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, eventId: 'e', title: id, tMinusLabel: 'T', tMinusOffsetMinutes: -1440, calculatedDate: '2026-09-27', category: 'booking', status: 'pending', ...extra }) as any;
const ev = (milestones: any[]) => ({ id: 'e', title: 'Trip', eventDate: '2026-10-20', status: 'milestones_active', context: {}, milestones }) as any;

describe('week progress ring', () => {
  it('counts only tasks ticked off in the last 7 days as done', () => {
    const events = [ev([
      ms('a', { status: 'completed', completedAt: '2026-09-27T09:00:00Z' }),
      ms('b', { status: 'completed', completedAt: '2026-09-25T09:00:00Z' }),
      ms('old', { status: 'completed', completedAt: '2026-09-01T09:00:00Z' }),
      ms('hidden', { status: 'completed', completedAt: '2026-09-27T09:00:00Z', isActive: false }),
    ])];
    const p = computeWeekProgress(events, ref, 4);
    expect(p).toMatchObject({ done: 2, total: 6 });
    expect(p.ratio).toBeCloseTo(1 / 3);
    expect(p.tone).toBe('mid');
  });

  it('colours by how far along the week is', () => {
    expect(computeWeekProgress([ev([])], ref, 5).tone).toBe('low');
    const three = [ev([1, 2, 3].map((n) => ms(`d${n}`, { status: 'completed', completedAt: '2026-09-28T08:00:00Z' })))];
    expect(computeWeekProgress(three, ref, 1).tone).toBe('high');
    expect(computeWeekProgress(three, ref, 0)).toMatchObject({ ratio: 1, tone: 'done' });
    expect(computeWeekProgress([ev([])], ref, 0)).toMatchObject({ total: 0, ratio: 1, tone: 'done' });
  });
});
