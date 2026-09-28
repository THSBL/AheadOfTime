import { describe, it, expect } from 'vitest';
import { describePendingPush, isPlanPushed, pendingPushItems } from './pushStatus';

const ms = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, status: 'pending', ...extra }) as any;
const ev = (extra: Record<string, unknown>) => ({ id: 'e', title: 'Trip', eventDate: '2026-11-01', context: {}, ...extra }) as any;

describe('push status of a plan', () => {
  it('counts the event and every shown task that has no Google id', () => {
    const e = ev({ milestones: [ms('a'), ms('b'), ms('c', { googleTaskId: 't1' })] });
    expect(pendingPushItems(e)).toBe(3);
    expect(isPlanPushed(e)).toBe(false);
    expect(describePendingPush(e)).toBe('2 tasks + the event');
  });

  it('an event imported from the calendar only needs its tasks', () => {
    const e = ev({ googleEventId: 'gcal123', milestones: [ms('a')] });
    expect(pendingPushItems(e)).toBe(1);
    expect(describePendingPush(e)).toBe('1 task · event already in calendar');
  });

  it('is pushed once the event and every shown task are in Google; hidden tasks and local ids do not count', () => {
    const pushed = ev({ googleEventId: 'g', milestones: [ms('a', { googleTaskId: 't' }), ms('b', { isActive: false })] });
    expect(isPlanPushed(pushed)).toBe(true);
    expect(describePendingPush(pushed)).toBe('In calendar');
    expect(isPlanPushed(ev({ googleEventId: 'local_1', milestones: [] }))).toBe(false);
  });
});
