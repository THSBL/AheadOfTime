/**
 * Pure formatting helpers shared by the browser's Google push
 * (src/services/googleCalendar.ts, which re-exports them) and the server's
 * background push (server/googleBackgroundPush.ts). They live here, free of
 * any browser/Vite-only globals, so both sides produce byte-identical titles
 * and dates for the same milestone.
 */

/**
 * Utility to extract clean YYYY-MM-DD from any date string or ISO string
 */
export function extractDateOnly(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch {
    // fallback
  }
  return dateStr.substring(0, 10);
}

/**
 * Format RFC3339 start and end dateTimes cleanly
 */
export function formatStartEndDateTime(
  dateInput: string,
  preferredTime = '09:00',
  durationMinutes = 30
): { startDateTime: string; endDateTime: string; dateOnly: string } {
  const dateOnly = extractDateOnly(dateInput);
  const timeParts = preferredTime.split(':').map(Number);
  const startHrs = isNaN(timeParts[0]) ? 9 : Math.min(23, Math.max(0, timeParts[0]));
  const startMins = isNaN(timeParts[1]) ? 0 : Math.min(59, Math.max(0, timeParts[1]));

  const startHoursStr = String(startHrs).padStart(2, '0');
  const startMinsStr = String(startMins).padStart(2, '0');
  const startDateTime = `${dateOnly}T${startHoursStr}:${startMinsStr}:00`;

  const totalMins = startHrs * 60 + startMins + durationMinutes;
  const endHrs = Math.min(23, Math.floor(totalMins / 60));
  const endMinutes = totalMins % 60;
  const endHoursStr = String(endHrs).padStart(2, '0');
  const endMinutesStr = String(endMinutes).padStart(2, '0');
  const endDateTime = `${dateOnly}T${endHoursStr}:${endMinutesStr}:00`;

  return { startDateTime, endDateTime, dateOnly };
}

/**
 * Extracts "DD/MM" directly from an ISO date string's digits (date-only
 * "YYYY-MM-DD" or a full "YYYY-MM-DDTHH:mm:ss..." timestamp) rather than
 * constructing a Date object and reading local getters - the latter is a
 * classic source of off-by-one-day bugs here, since a date-only string
 * parses as UTC midnight and a negative-UTC-offset timezone's local
 * getters would then roll it back to the previous day.
 */
function formatShortDayMonth(dateInput: string): string {
  const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, , month, day] = match;
  return `${day}/${month}`;
}

/**
 * Single shared title formatter for anywhere a milestone's title reaches
 * Google Calendar or Google Tasks, so a milestone's title is stable across
 * its lifecycle instead of changing format the first time it's marked done.
 *
 * Task leads (it's the actionable part); the event name and due date trail
 * as context after middle dots, which degrades gracefully under truncation
 * on the most space-constrained surface (Google Calendar's month-grid
 * view, effectively ~20-28 visible characters) - a truncated "Book dog
 * sitter · Ibiza trip…" still reads correctly, unlike a truncated bracket
 * or colon-separated format. The trailing due date (DD/MM) means the task
 * is identifiable even in a list view or notification that doesn't
 * otherwise show its date.
 *
 * A leading marker is reserved for exactly two things worth spending a
 * character on: ⚠ for a milestone that's overdue/at-risk, and ✅ for one
 * that's completed. An on-track milestone gets no marker at all.
 */
export function formatMilestoneCalendarTitle(
  milestoneTitle: string,
  eventTitle: string,
  dueDate: string,
  status?: { isOverdue?: boolean; isCompleted?: boolean }
): string {
  const cleanTitle = milestoneTitle
    // Note: 📋 is an astral (surrogate-pair) character - it must be matched
    // via alternation, not inside a [...] character class, which would
    // silently split it into its two separate surrogate code units.
    .replace(/^(?:✅|📋|⚠)\s*/, '')
    .replace(/^\[TASK\]\s*(\[T[^\]]*\]\s*)?/i, '')
    .replace(/^AheadOfTime:\s*/i, '')
    .trim();
  const marker = status?.isCompleted ? '✅ ' : status?.isOverdue ? '⚠ ' : '';
  const dateLabel = formatShortDayMonth(dueDate);
  return `${marker}${cleanTitle} · ${eventTitle}${dateLabel ? ` · ${dateLabel}` : ''}`;
}
