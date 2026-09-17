import { generateContentFast, DEFAULT_FAST_MODELS } from '../../server/agentProcessor.js';

// Consolidated Vercel function for /api/presets/calibrate-offsets (POST) and
// /api/presets/smart-import (POST) - vercel.json rewrites both old paths
// here with an ?action= query param, so the frontend and server.ts's own
// Express routes need no changes. Vercel's Hobby plan caps a deployment at
// 12 serverless functions; merging same-domain endpoints like this is how
// this project stays under that cap as routes are added over time (see
// api/telegram/[...path].ts for the same pattern applied earlier). Logic
// below is ported verbatim from the two files this replaces - each kept as
// its own function so neither's large prompt text is harder to find.

async function handleCalibrateOffsets(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/presets/calibrate-offsets requires POST.' });
    return;
  }

  try {
    const {
      presetTitle = 'Project Workflow',
      targetDate = '2026-11-20',
      tasks = []
    }: {
      presetTitle?: string;
      targetDate?: string;
      tasks: Array<{ task: string; description?: string; tag?: string }>;
    } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ error: 'At least one task is required for calibration' });
      return;
    }

    // Heuristic fallback calculation in case LLM is not configured or fails
    const computeHeuristicCalibration = () => {
      const total = tasks.length;
      return tasks.map((t, idx) => {
        const titleLower = t.task.toLowerCase();
        let days = Math.round(Math.max(0, 45 - (idx * (45 / Math.max(1, total - 1)))));

        // Adjust for strong keywords
        if (titleLower.includes('kickoff') || titleLower.includes('scope') || titleLower.includes('architecture')) {
          days = Math.max(days, 45);
        } else if (titleLower.includes('beta') || titleLower.includes('design') || titleLower.includes('draft')) {
          days = Math.max(days, 30);
        } else if (titleLower.includes('qa') || titleLower.includes('test') || titleLower.includes('security') || titleLower.includes('audit')) {
          days = Math.max(days, 14);
        } else if (titleLower.includes('stage') || titleLower.includes('staging') || titleLower.includes('submission') || titleLower.includes('sign-off')) {
          days = Math.min(days, 7);
          days = Math.max(days, 2);
        } else if (titleLower.includes('launch') || titleLower.includes('release') || titleLower.includes('deploy') || titleLower.includes('live')) {
          days = 0;
        } else if (titleLower.includes('retro') || titleLower.includes('review') && idx === total - 1) {
          days = -7;
        }

        const isDeliverable = /deliverable|order|reserve|book|submit|lock|deploy|flip|dispatch/i.test(t.task);

        return {
          task: t.task,
          t_minus_days: days,
          tag: t.tag || (/qa|test/i.test(t.task) ? 'QA' : /design|asset/i.test(t.task) ? 'Design' : /security|legal/i.test(t.task) ? 'Security' : 'Operations'),
          description: t.description || `Heuristically calibrated offset for ${t.task} (${days >= 0 ? `T-${days}d` : `Day +${Math.abs(days)}`})`,
          kind: isDeliverable ? 'deliverable' : 'milestone',
          scope: Math.abs(days) >= 14 ? 'macro' : 'micro',
        };
      }).sort((a, b) => b.t_minus_days - a.t_minus_days);
    };

    if (!process.env.GEMINI_API_KEY) {
      const calibratedTasks = computeHeuristicCalibration();
      res.json({ calibratedTasks, calibratedBy: 'heuristic_engine' });
      return;
    }

    const taskListText = tasks
      .map((t, idx) => `${idx + 1}. [Tag: ${t.tag || 'General'}] Title: "${t.task}"${t.description ? ` - Details: "${t.description}"` : ''}`)
      .join('\n');

    const prompt = `You are a Principal Technical Program Manager and Logistics Systems Architect.
A user uploaded an unstructured project checklist or workflow for "${presetTitle}".
The target execution/launch date is "${targetDate}".
The tasks currently lack explicit T-minus lead times or have uncalibrated timelines.

Tasks to backward-plan and calibrate:
${taskListText}

YOUR OBJECTIVE:
Calculate realistic, backward-planned T-Minus offsets (integer number of days relative to the target date) for each task so that:
1. Pre-requisites and foundation tasks precede downstream validation and deployment.
2. Adequate buffer is preserved (e.g., QA regressions and security sign-offs have real runway).
3. Critical-path deliverables (orders, submissions, freezes) occur at realistic logistical milestones.
4. If a task is post-event (e.g., retro, 30-day review), assign a negative integer offset (e.g., -7 for Day +7).

Return a JSON object strictly following this structure:
{
  "calibratedTasks": [
    {
      "task": "Refined and clean task title",
      "t_minus_days": 30,
      "tag": "QA | Legal | Design | Engineering | Operations | Marketing | DevOps | HR",
      "description": "Crisp 1-sentence operational rationale for this lead time",
      "kind": "milestone" or "deliverable",
      "scope": "macro" or "micro"
    }
  ]
}

Ensure every input task is preserved and calibrated. Output ONLY the raw JSON object.`;

    const result = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      }),
      DEFAULT_FAST_MODELS,
      8000
    );

    let parsedResult: any = null;
    try {
      const cleanJson = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResult = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.warn('Failed to parse Gemini calibrated offsets response:', parseErr);
    }

    if (parsedResult && Array.isArray(parsedResult.calibratedTasks) && parsedResult.calibratedTasks.length > 0) {
      const sorted = parsedResult.calibratedTasks.sort((a: any, b: any) => (b.t_minus_days || 0) - (a.t_minus_days || 0));
      res.json({ calibratedTasks: sorted, calibratedBy: result.usedModel });
      return;
    }

    const fallback = computeHeuristicCalibration();
    res.json({ calibratedTasks: fallback, calibratedBy: 'heuristic_engine_fallback' });
  } catch (error: any) {
    console.error('Error in /api/presets/calibrate-offsets:', error);
    res.status(500).json({ error: 'Failed to calibrate offsets' });
  }
}

async function handleSmartImport(req: any, res: any) {
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

export default async function handler(req: any, res: any) {
  const action = req.query?.action as string;

  if (action === 'calibrate-offsets') {
    return handleCalibrateOffsets(req, res);
  }
  if (action === 'smart-import') {
    return handleSmartImport(req, res);
  }

  return res.status(404).json({ error: 'Unknown action' });
}
