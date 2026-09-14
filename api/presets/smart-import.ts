import { generateContentFast, DEFAULT_FAST_MODELS } from '../../server/agentProcessor.js';

// Vercel serverless equivalent of server.ts's POST /api/presets/smart-import
// route. Logic ported verbatim; generateContentFast/DEFAULT_FAST_MODELS are
// imported from server/agentProcessor.ts, same pattern as api/presets/calibrate-offsets.ts.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/presets/smart-import requires POST.' });
    return;
  }

  try {
    const {
      fileName = 'Uploaded workbook',
      sheets = [],
    }: {
      fileName?: string;
      sheets: Array<{ name: string; rows: any[][] }>;
    } = req.body;

    if (!Array.isArray(sheets) || sheets.length === 0) {
      res.status(400).json({ error: 'At least one sheet with rows is required for smart import' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.json({
        extractedBy: 'unavailable',
        error: 'AI smart import requires Gemini to be configured on this environment. Use manual column mapping instead.',
      });
      return;
    }

    const MAX_ROWS_TOTAL = 400;
    let rowBudget = MAX_ROWS_TOTAL;
    const sheetsText = sheets
      .map((sheet) => {
        if (rowBudget <= 0) return '';
        const rows = sheet.rows.slice(0, rowBudget);
        rowBudget -= rows.length;
        const rowsText = rows
          .map((row, idx) => `${idx + 1}. ${row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' | ')}`)
          .join('\n');
        return `--- SHEET: "${sheet.name}" ---\n${rowsText}`;
      })
      .filter(Boolean)
      .join('\n\n');

    const prompt = `You are an elite program manager who specializes in reading messy, real-world spreadsheets — dashboards, weekly execution schedules, RACI matrices, status trackers — spread across multiple tabs, and extracting the real underlying project plan even when headers are buried mid-sheet, columns are decorative, or numbers are missing.

A user uploaded a workbook named "${fileName}" while trying to import it into a T-Minus milestone planning tool. Below is the raw content of every sheet, row by row (blank rows already stripped).

${sheetsText}

YOUR OBJECTIVE:
1. Infer what this file is actually planning (e.g. a product launch, a marketing campaign, an onboarding process, a sales cycle) and infer a short, specific preset title for it.
2. Infer the real-world target/anchor date this plan counts down to, if one is stated or implied anywhere in the sheets (e.g. "Launch Day: Thursday", a specific calendar date). If genuinely absent, use null.
3. Distill the file into 6 to 14 MEANINGFUL milestones — not a copy of every execution row. Collapse granular hour-by-hour tasks into the gates, deliverables, cross-functional syncs and dated decisions that actually matter for a reusable planning template. Prefer named gates, sign-offs, freezes, launches and reviews over routine busywork rows.
4. Calculate each milestone's t_minus_days as an integer offset relative to the inferred target/anchor date (positive = before, 0 = on the day, negative = after, e.g. -7 for "Day +7").
5. Assign a short, human tag per milestone (department/function, e.g. "Marketing", "Tech", "PR", "Leadership") and a crisp one-sentence description grounded in what the sheet actually says — never generic filler.
6. Propose 2 to 4 ADDITIONAL milestones that are NOT already present in the file but would meaningfully round out this specific plan (e.g. an internal stakeholder recap, a post-mortem, a legal review) — for each, include a short "rationale" written as a helpful suggestion to the user explaining why it's commonly missing and useful for this kind of plan.

Return a JSON object strictly following this structure:
{
  "presetTitle": "Specific, short preset name inferred from the file",
  "tags": ["2 to 4 short tags"],
  "targetDateGuess": "YYYY-MM-DD" or null,
  "milestones": [
    {
      "task": "Clear milestone title",
      "t_minus_days": 14,
      "tag": "Short department/function tag",
      "description": "Crisp 1-sentence description grounded in the source data",
      "kind": "milestone" or "deliverable",
      "scope": "macro" or "micro"
    }
  ],
  "suggestedAdditions": [
    {
      "task": "Milestone title not present in the source file",
      "t_minus_days": -1,
      "tag": "Short department/function tag",
      "description": "Crisp 1-sentence description of the task itself",
      "kind": "milestone" or "deliverable",
      "scope": "macro" or "micro",
      "rationale": "1-sentence explanation of why this is a useful addition for this plan"
    }
  ]
}

Output ONLY the raw JSON object.`;

    const result = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.15,
        }
      }),
      DEFAULT_FAST_MODELS,
      15000
    );

    const cleanJson = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (!parsed || !Array.isArray(parsed.milestones) || parsed.milestones.length === 0) {
      throw new Error('Model returned no extractable milestones');
    }

    res.json({
      presetTitle: parsed.presetTitle || fileName.replace(/\.[^/.]+$/, ''),
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : ['Custom'],
      targetDateGuess: parsed.targetDateGuess || null,
      milestones: parsed.milestones.sort((a: any, b: any) => (b.t_minus_days || 0) - (a.t_minus_days || 0)),
      suggestedAdditions: Array.isArray(parsed.suggestedAdditions) ? parsed.suggestedAdditions : [],
      extractedBy: result.usedModel,
    });
  } catch (error: any) {
    console.error('Error in /api/presets/smart-import:', error);
    res.status(500).json({ error: 'Failed to extract milestones from this file. Try manual column mapping instead.' });
  }
}
