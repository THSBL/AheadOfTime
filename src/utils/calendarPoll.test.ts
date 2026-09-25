import { describe, it, expect } from 'vitest';
import { parseCalendarVote } from './calendarPoll';

const base = { calendar: 'outlook', source: 'landing', visitorId: '3f2b9c1e-aaaa-4bbb-8ccc-123456789abc' };

describe('parseCalendarVote (anonymous /api/feedback/calendar-poll)', () => {
  it('accepts a valid vote with an optional notify email', () => {
    expect(parseCalendarVote({ ...base, notifyEmail: ' Me@Example.com ' })).toEqual({
      vote: { calendar: 'outlook', source: 'landing', visitorId: base.visitorId, otherText: undefined, notifyEmail: 'me@example.com' },
    });
  });

  it('keeps free text only for "other", trimmed and capped', () => {
    const r = parseCalendarVote({ ...base, calendar: 'other', otherText: `  Proton ${'x'.repeat(200)}` });
    expect('vote' in r && r.vote.otherText?.startsWith('Proton')).toBe(true);
    expect('vote' in r && r.vote.otherText!.length).toBe(80);
    expect(parseCalendarVote({ ...base, otherText: 'ignored' })).toMatchObject({ vote: { otherText: undefined } });
  });

  it('never stores an email for Google (nothing to notify about)', () => {
    expect(parseCalendarVote({ ...base, calendar: 'google', notifyEmail: 'me@example.com' })).toMatchObject({ vote: { notifyEmail: undefined } });
  });

  it('rejects unknown values, bad ids and malformed emails', () => {
    expect(parseCalendarVote({ ...base, calendar: 'yahoo' })).toEqual({ error: 'Unknown calendar.' });
    expect(parseCalendarVote({ ...base, source: 'admin' })).toEqual({ error: 'Unknown source.' });
    expect(parseCalendarVote({ ...base, visitorId: "'; drop table--" })).toEqual({ error: 'Invalid visitor id.' });
    expect(parseCalendarVote({ ...base, notifyEmail: 'not-an-email' })).toEqual({ error: 'That email address does not look right.' });
    expect(parseCalendarVote(null)).toEqual({ error: 'Missing body.' });
  });
});
