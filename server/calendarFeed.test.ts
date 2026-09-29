import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFeedIcs, parseDoneToken, parseFeedToken, parsePlanToken, signDoneToken, signFeedToken, signPlanToken } from './calendarFeed';

const USER = '11111111-2222-3333-4444-555555555555';
const TASK = '99999999-8888-7777-6666-555555555555';

describe('calendar feed', () => {
  beforeEach(() => {
    process.env.NOTIFY_LINK_SECRET = 'test-secret';
  });
  afterEach(() => {
    delete process.env.NOTIFY_LINK_SECRET;
  });

  it('signs and verifies feed and done tokens', () => {
    const feed = signFeedToken(USER, 3)!;
    expect(parseFeedToken(feed)).toEqual({ userId: USER, version: 3 });
    expect(parseFeedToken(feed.replace('.3.', '.4.'))).toBeNull();
    const done = signDoneToken(USER, 3, TASK)!;
    expect(parseDoneToken(done)).toEqual({ userId: USER, version: 3, milestoneId: TASK });
    expect(parseDoneToken(done.replace(TASK, TASK.replace('9', '8')))).toBeNull();
    const plan = signPlanToken(USER, 3, TASK)!;
    expect(parsePlanToken(plan)).toEqual({ userId: USER, version: 3, eventId: TASK });
    expect(parseDoneToken(plan)).toBeNull();
  });

  it('refuses tokens without a secret', () => {
    const feed = signFeedToken(USER, 1)!;
    delete process.env.NOTIFY_LINK_SECRET;
    expect(parseFeedToken(feed)).toBeNull();
    expect(signFeedToken(USER, 1)).toBeNull();
  });

  it('writes valid all-day entries with a Mark done link for open tasks only', () => {
    const ics = buildFeedIcs({
      appUrl: 'https://aheadoftime.app',
      doneUrl: (id) => `https://aheadoftime.app/api/calendar/done?t=${id}`,
      planUrl: (eventId, action) => `https://aheadoftime.app/api/calendar/plan?a=${action}&t=${eventId}`,
      now: new Date('2026-10-01T10:00:00Z'),
      tasks: [
        { id: 'a', title: 'Book flights, hotel', description: null, date: '2026-10-05', status: 'pending', eventTitle: 'Trip to Cologne', eventDate: '2026-10-21', eventPublicId: 'evt-1', eventId: 'e-uuid', updatedAt: '2026-10-01T09:00:00.000Z' },
        { id: 'b', title: 'Pack', description: 'Warm coat', date: '2026-10-20', status: 'completed', eventTitle: 'Trip to Cologne', eventDate: '2026-10-21', eventPublicId: 'evt-1', eventId: 'e-uuid', updatedAt: '2026-10-01T09:00:00.000Z' },
      ],
    });
    const unfolded = ics.replace(/\r\n /g, '');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261005');
    expect(unfolded).toContain('DTEND;VALUE=DATE:20261006');
    expect(unfolded).toContain('SUMMARY:Book flights\\, hotel · Trip to Cologne');
    expect(unfolded).toContain('Mark this task done: https://aheadoftime.app/api/calendar/done?t=a');
    expect(unfolded).toContain('SUMMARY:✓ Pack · Trip to Cologne');
    expect(unfolded).not.toContain('done?t=b');
    expect(unfolded).toContain('All tasks for Trip to Cologne done: https://aheadoftime.app/api/calendar/plan?a=done&t=e-uuid');
    expect(unfolded).toContain('Trip to Cologne not happening? Remove the plan: https://aheadoftime.app/api/calendar/plan?a=remove&t=e-uuid');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true);
  });
});
