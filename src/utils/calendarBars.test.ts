import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../types';
import { eventBarsForWeek } from './calendarView';

const ev = (id: string, eventDate: string, endDate?: string): CalendarEvent =>
  ({ id, title: id, eventDate, endDate, category: 'custom', status: 'milestones_active', context: {}, milestones: [], createdAt: '', updatedAt: '' }) as CalendarEvent;

describe('eventBarsForWeek', () => {
  it('keeps a multi-day event on one row across its days', () => {
    const bars = eventBarsForWeek([ev('dinner', '2026-09-26'), ev('trip', '2026-09-26', '2026-09-27')], '2026-09-21');
    const trip = bars.find((b) => b.event.id === 'trip')!;
    const dinner = bars.find((b) => b.event.id === 'dinner')!;
    expect(trip).toMatchObject({ startCol: 5, span: 2, lane: 0 });
    expect(dinner).toMatchObject({ startCol: 5, span: 1, lane: 1 });
  });

  it('cuts bars at the week edges and reuses free rows', () => {
    const bars = eventBarsForWeek([ev('long', '2026-09-19', '2026-09-23'), ev('later', '2026-09-25')], '2026-09-21');
    expect(bars[0]).toMatchObject({ startCol: 0, span: 3, lane: 0, continuesBefore: true, continuesAfter: false });
    expect(bars[1]).toMatchObject({ startCol: 4, span: 1, lane: 0 });
  });
});
