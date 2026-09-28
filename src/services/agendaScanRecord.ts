/**
 * When the agenda was last scanned, and up to which date. The header's
 * "Agenda synced · <month>" shows this instead of a date computed from the
 * chosen window, so it only claims what a scan actually covered.
 */
const KEY = 'aot_last_agenda_scan';
export const AGENDA_SCANNED_EVENT = 'aot_agenda_scanned';

export interface AgendaScanRecord {
  /** When the scan ran (ISO). */
  at: string;
  /** Last day the scan looked at (ISO). */
  until: string;
}

export function readAgendaScan(): AgendaScanRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.at === 'string' && typeof parsed?.until === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function recordAgendaScan(untilIso: string): void {
  const record: AgendaScanRecord = { at: new Date().toISOString(), until: untilIso };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // storage unavailable: the header just keeps its previous value
  }
  window.dispatchEvent(new CustomEvent(AGENDA_SCANNED_EVENT, { detail: record }));
}

const HORIZON_KEY = 'aot_agenda_horizon_months';

/** How far ahead a scan looks: 3, 6 or 12 months (6 by default). */
export function readAgendaHorizon(): number {
  try {
    const n = Number(localStorage.getItem(HORIZON_KEY));
    return n === 3 || n === 6 || n === 12 ? n : 6;
  } catch {
    return 6;
  }
}

export function saveAgendaHorizon(months: number): void {
  try {
    localStorage.setItem(HORIZON_KEY, String(months));
  } catch {
    // not remembered across visits, still used for this one
  }
}
