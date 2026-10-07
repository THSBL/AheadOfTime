import { describe, it, expect } from 'vitest';
import { snapshotFromEvent } from './sharedPlans';
import { exampleForWeek, WEEKLY_EXAMPLES } from './weeklyContent';

describe('snapshotFromEvent (what a shared link may show)', () => {
  const event = {
    id: 'evt-1',
    title: "Mum's 60th – Sat 14 Nov",
    eventDate: '2026-11-14',
    eventTime: '19:00',
    location: 'Our house, 12 Secret Street',
    notes: 'private note',
    context: { budget: 900 },
    category: 'dinner_social',
    milestones: [
      { title: 'Book the table', calculatedDate: '2026-10-20T09:00:00', status: 'pending', deliverables: [{ title: 'Reserve at Lilia or Llama Inn' }, 'Confirm headcount'], description: 'secret' },
      { title: 'Hidden step', calculatedDate: '2026-10-21', isActive: false },
      { title: 'Skipped step', calculatedDate: '2026-10-22', status: 'skipped' },
      { title: 'Buy the gift', calculatedDate: '2026-11-01', status: 'completed', deliverables: [] },
      { title: 'No date', calculatedDate: 'soon' },
    ],
  };

  it('keeps only title, dates, time, category and the active steps with their ideas', () => {
    const snap = snapshotFromEvent(event)!;
    expect(snap).toEqual({
      title: "Mum's 60th – Sat 14 Nov",
      eventDate: '2026-11-14',
      eventTime: '19:00',
      category: 'dinner_social',
      steps: [
        { title: 'Book the table', date: '2026-10-20', ideas: ['Reserve at Lilia or Llama Inn', 'Confirm headcount'], done: false },
        { title: 'Buy the gift', date: '2026-11-01', ideas: [], done: true },
      ],
    });
    const json = JSON.stringify(snap);
    for (const secret of ['Secret Street', 'private note', 'budget', 'secret']) expect(json).not.toContain(secret);
  });

  it('refuses a plan without a title or a date', () => {
    expect(snapshotFromEvent({ title: '', eventDate: '2026-11-14' })).toBeNull();
    expect(snapshotFromEvent({ title: 'X', eventDate: 'tomorrow' })).toBeNull();
    expect(snapshotFromEvent(null)).toBeNull();
  });

  it('caps long text and the number of steps', () => {
    const many = { title: 'x'.repeat(500), eventDate: '2026-11-14', milestones: Array.from({ length: 60 }, (_, i) => ({ title: `Step ${i}`, calculatedDate: '2026-11-01' })) };
    const snap = snapshotFromEvent(many)!;
    expect(snap.title.length).toBe(160);
    expect(snap.steps.length).toBe(40);
  });
});

describe('weekly content rotation', () => {
  it('moves to the next example each week and covers them all', () => {
    const seen = new Set<string>();
    const start = new Date('2026-10-05T08:00:00Z');
    for (let w = 0; w < WEEKLY_EXAMPLES.length; w++) {
      seen.add(exampleForWeek(new Date(start.getTime() + w * 7 * 86_400_000)).example.key);
    }
    expect(seen.size).toBe(WEEKLY_EXAMPLES.length);
  });

  it('labels the ISO week', () => {
    expect(exampleForWeek(new Date('2026-10-05T08:00:00Z')).weekLabel).toBe('2026-W41');
  });
});
