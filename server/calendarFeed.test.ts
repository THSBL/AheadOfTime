import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFeedIcs, parseDoneToken, parseFeedToken, signDoneToken, signFeedToken } from './calendarFeed';

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
      now: new Date('2026-10-01T10:00:00Z'),
      tasks: [
        { id: 'a', title: 'Book flights, hotel', description: null, date: '2026-10-05', status: 'pending', eventTitle: 'Trip to Cologne', eventDate: '2026-10-21', eventPublicId: 'evt-1', updatedAt: '2026-10-01T09:00:00.000Z' },
        { id: 'b', title: 'Pack', description: 'Warm coat', date: '2026-10-20', status: 'completed', eventTitle: 'Trip to Cologne', eventDate: '2026-10-21', eventPublicId: 'evt-1', updatedAt: '2026-10-01T09:00:00.000Z' },
      ],
    });
    const unfolded = ics.replace(/\r\n /g, '');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261005');
    expect(unfolded).toContain('DTEND;VALUE=DATE:20261006');
    expect(unfolded).toContain('SUMMARY:Book flights\\, hotel · Trip to Cologne');
    expect(unfolded).toContain('Mark done: https://aheadoftime.app/api/calendar/done?t=a');
    expect(unfolded).toContain('SUMMARY:✓ Pack · Trip to Cologne');
    expect(unfolded).not.toContain('done?t=b');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true);
  });
});
