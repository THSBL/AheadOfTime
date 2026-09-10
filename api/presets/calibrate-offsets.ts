import { generateContentFast, DEFAULT_FAST_MODELS } from '../../server/agentProcessor.js';

// Vercel serverless equivalent of server.ts's POST /api/presets/calibrate-offsets
// route. Logic ported verbatim; generateContentFast/DEFAULT_FAST_MODELS are
// imported from server/agentProcessor.ts, same pattern as api/agent/process.ts.
export default async function handler(req: any, res: any) {
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
