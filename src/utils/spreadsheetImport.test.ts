import { describe, expect, it } from 'vitest';
import { parseSpreadsheetFile, parseSpreadsheetForAI } from './templateEngine';

describe('spreadsheet import', () => {
  it('reads a CSV: first row as headers, blank rows dropped', async () => {
    const file = new File(['Task,Days before\nBook venue,30\n,\n"Send invites, early",14\n'], 'plan.csv', { type: 'text/csv' });
    const { headers, rows } = await parseSpreadsheetFile(file);
    expect(headers).toEqual(['Task', 'Days before']);
    expect(rows).toEqual([
      { Task: 'Book venue', 'Days before': '30' },
      { Task: 'Send invites, early', 'Days before': '14' },
    ]);
    const ai = await parseSpreadsheetForAI(file);
    expect(ai.sheets[0].rows).toHaveLength(3);
  });

  it('asks for .xlsx instead of the old .xls format', async () => {
    await expect(parseSpreadsheetFile(new File(['x'], 'old.xls'))).rejects.toThrow(/save it as .xlsx/i);
  });
});
