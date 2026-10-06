/**
 * SQL twin of isPastEventTask (src/utils/readiness.ts): a task that no
 * longer matters because its event has happened.
 * - preparation (lead time <= 0, or without one dated on/before the event),
 *   once the event's day has passed;
 * - for an event spanning several days, a task during it, once the whole
 *   event is over.
 * Only T+ tasks - planned for after the event - stay and keep their
 * reminders.
 *
 * Expects the aliases `m` (milestones) and `e` (events); `todayParam` is the
 * placeholder holding today's date, e.g. '$2'. The lead time lives in the
 * stored task (client_payload.tMinusOffsetMinutes, in minutes); it is only
 * read through regular expressions, never cast, so odd stored values can't
 * break the query.
 */
export function staleTaskSql(todayParam: string): string {
  const offset = `(m.client_payload->>'tMinusOffsetMinutes')`;
  // A lead time after the event: no minus sign and a non-zero digit.
  const after = `${offset} ~ '^[0-9]*[.]?[0-9]*[1-9]'`;
  const isPrep = `(CASE WHEN ${offset} ~ '^-?[0-9]' THEN NOT (${after}) ELSE m.calculated_date::date <= e.event_date END)`;
  return `(
    (${isPrep} AND ${todayParam}::date > e.event_date)
    OR (NOT ${isPrep}
        AND e.end_date IS NOT NULL AND e.end_date > e.event_date
        AND ${todayParam}::date > e.end_date
        AND m.calculated_date::date <= e.end_date)
  )`;
}
