import { describe, it, expect } from 'vitest';
import { buildPlanIcs, cleanSettings, publicView, snapshotFromEvent, withPlanPreviewTags } from './sharedPlans';
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

describe('a plan link shared with guests', () => {
  const event = {
    id: 'evt-2',
    title: 'Secret Santa with the family',
    category: 'party',
    eventDate: '2026-12-20',
    eventTime: '18:00',
    milestones: [
      { id: 'm1', title: 'Draw names', calculatedDate: '2026-11-10', status: 'pending' },
      { id: 'm2', title: 'Wishlists in', calculatedDate: '2026-11-22', status: 'pending', deliverables: [{ title: 'Three ideas under €25' }] },
    ],
  };
  const settings = cleanSettings({ audience: 'guests', everyone: ['m2'] });

  it('marks the steps guests see, and the page shows only those', () => {
    const snap = snapshotFromEvent(event, settings)!;
    expect(snap.steps.map((s) => [s.id, s.everyone])).toEqual([['m1', false], ['m2', true]]);
    expect(snap.fixed).toEqual([{ key: 'event', title: 'Secret Santa with the family', date: '2026-12-20', time: '18:00' }]);
    expect(publicView(snap).steps.map((s) => s.title)).toEqual(['Wishlists in']);
    expect(publicView({ ...snap, audience: 'all' }).steps).toHaveLength(2);
  });

  it('keeps earlier choices when only part of the settings change', () => {
    const next = cleanSettings({ reminders: { style: 'events', time: '20:00', minutes: 15 } }, settings);
    expect(next).toEqual({ audience: 'guests', everyone: ['m2'], reminders: { style: 'events', time: '20:00', minutes: 15 } });
  });

  it('the calendar: the day as an event, steps as all-day tasks or timed reminders', () => {
    const snap = snapshotFromEvent(event, settings)!;
    const now = new Date('2026-11-01T10:00:00Z');
    const tasks = buildPlanIcs({ snapshot: snap, token: 'tok12345', planUrl: 'https://aheadoftime.app/p/tok12345', now });
    expect(tasks).toContain('UID:event-tok12345@aheadoftime.app');
    expect(tasks).toContain('DTSTART:20261220T180000');
    expect(tasks).toContain('DTEND:20261220T200000');
    expect(tasks).toContain('DTSTART;VALUE=DATE:20261122');
    expect(tasks).toContain('SUMMARY:Wishlists in');
    const timed = buildPlanIcs({ snapshot: snap, token: 'tok12345', planUrl: 'x', reminders: { style: 'events', time: '19:30', minutes: 30 }, now });
    expect(timed).toContain('DTSTART:20261122T193000');
    expect(timed).toContain('DTEND:20261122T200000');
    expect(timed.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("the page's preview tags: the plan's picture, neutral text", () => {
    const shell = `<html><head><title>Ahead Of Time</title>
    <meta name="description" content="Long text" />
    <meta property="og:title" content="Ahead Of Time" />
    <meta property="og:description" content="Long text" />
    <meta property="og:url" content="https://aheadoftime.app/" />
    <meta property="og:image" content="https://aheadoftime.app/card.png" />
    </head><body></body></html>`;
    const html = withPlanPreviewTags(shell, { title: 'Mum & "Dad"', pageUrl: 'https://aheadoftime.app/p/tok', imageUrl: 'https://aheadoftime.app/api/plan/image/tok.jpg?v=2' });
    expect(html).toContain('<meta property="og:title" content="Shared plan · Ahead Of Time" />');
    expect(html).toContain('<meta property="og:description" content="" />');
    expect(html).toContain('<meta property="og:image" content="https://aheadoftime.app/api/plan/image/tok.jpg?v=2" />');
    expect(html).toContain('<title>Mum &amp; &quot;Dad&quot; - shared plan - Ahead Of Time</title>');
    expect(html).toContain('og:image:alt');
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
