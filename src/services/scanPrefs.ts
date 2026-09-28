import { DEFAULT_SCAN_PREFS, type ScanPrefs } from '../utils/eventEligibility';

/** What the user told Scan agenda about their calendar (per browser for now). */
const KEY = 'aot_scan_prefs';

export function readScanPrefs(): ScanPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_SCAN_PREFS, ...(raw?.birthdays === 'plan' ? { birthdays: 'plan' } : {}) };
  } catch {
    return { ...DEFAULT_SCAN_PREFS };
  }
}

export function saveScanPrefs(prefs: ScanPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // remembered for this visit only
  }
}
