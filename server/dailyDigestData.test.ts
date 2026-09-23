import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('./eventSyncSchema.js', () => ({ ensureEventSyncSchema: vi.fn() }));

import { listOpenDecisions } from './dailyDigestData';

describe('listOpenDecisions (architecture reset Phase 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flattens each event row into one decision per gap', async () => {
    queryMock.mockResolvedValue([
      {
        event_title: "Maya's dinner",
        outstanding_gaps: [
          { key: 'decide_venue', question: 'Decide: home dinner or restaurant reservation', impact: 'medium' },
          { key: 'user_responsibility', question: "Who's actually responsible for this?", impact: 'high' },
        ],
      },
      {
        event_title: 'Egypt dive trip',
        outstanding_gaps: [{ key: 'decide_gear', question: 'Decide: rent or bring your own dive gear', impact: 'medium' }],
      },
    ]);

    const result = await listOpenDecisions('u1', '2026-09-23T12:00:00.000Z');

    expect(result).toEqual([
      { eventTitle: "Maya's dinner", question: 'Decide: home dinner or restaurant reservation' },
      { eventTitle: "Maya's dinner", question: "Who's actually responsible for this?" },
      { eventTitle: 'Egypt dive trip', question: 'Decide: rent or bring your own dive gear' },
    ]);
  });

  it('returns nothing when there are no rows with open gaps', async () => {
    queryMock.mockResolvedValue([]);
    expect(await listOpenDecisions('u1', '2026-09-23T12:00:00.000Z')).toEqual([]);
  });

  it('scopes the query to the given user, non-deleted events, and a bounded horizon/high-impact filter', async () => {
    queryMock.mockResolvedValue([]);
    await listOpenDecisions('u1', '2026-09-23T12:00:00.000Z');

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('e.user_id = $1');
    expect(sql).toContain('e.deleted_at IS NULL');
    expect(sql).toContain('jsonb_array_length(e.outstanding_gaps) > 0');
    expect(sql).toContain("g->>'impact' = 'high'");
    expect(params[0]).toBe('u1');
    expect(params[1]).toBe('2026-09-23');
  });
});
