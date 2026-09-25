/**
 * Runs the same test messages through the full and the lean planning prompt
 * (server/planning/leanPlannerPrompt.ts) and writes a side-by-side HTML page:
 * both plans, how long each took and which model answered.
 *
 *   GEMINI_API_KEY=... npm run compare:prompts [-- out.html]
 *
 * Makes real Gemini calls (about 20). Nothing is saved to the database.
 */
import fs from 'fs';
import { processWithGemini } from '../server/agentProcessor.js';
import type { PlannerPromptVariant } from '../server/planning/leanPlannerPrompt.js';
import type { CalendarEvent } from '../src/types.js';

const REF = new Date();
const refIso = REF.toISOString();
const refDate = refIso.slice(0, 10);
const inDays = (n: number) => new Date(REF.getTime() + n * 86400000).toISOString().slice(0, 10);

interface Case {
  name: string;
  message: string;
  userProfile?: { homeZipOrLocation?: string; hasPet?: boolean };
  existingEvent?: CalendarEvent;
}

const existingTrip: CalendarEvent = {
  id: 'evt_existing',
  title: 'Trip to Lisbon',
  category: 'travel_trip',
  eventDate: inDays(40),
  endDate: inDays(44),
  status: 'milestones_active',
  context: { destination: 'Lisbon' },
  milestones: [
    { id: 'm1', eventId: 'evt_existing', title: 'Flights & Hotel Booked', slotKey: 'flights_hotel', tMinusLabel: 'T-30d', tMinusOffsetMinutes: -43200, calculatedDate: inDays(10), category: 'booking', status: 'completed', deliverables: [] },
    { id: 'm2', eventId: 'evt_existing', title: 'Bags Packed', slotKey: 'packing', tMinusLabel: 'T-2d', tMinusOffsetMinutes: -2880, calculatedDate: inDays(38), category: 'general', status: 'pending', deliverables: [] },
  ],
  createdAt: refIso,
  updatedAt: refIso,
} as CalendarEvent;

const CASES: Case[] = [
  { name: 'Business trip, dates picked', message: `Business trip to NYC for a presentation\n\nDetails:\n- When do you leave? ${inDays(24)} to ${inDays(28)}\n- Traveling alone or with colleagues? Alone`, userProfile: { homeZipOrLocation: 'Ghent', hasPet: true } },
  { name: 'Dive trip', message: `Diving trip to the Red Sea in Egypt from ${inDays(50)} to ${inDays(57)}, 2 people, we both have our Open Water`, userProfile: { homeZipOrLocation: 'Ghent' } },
  { name: 'Birthday party (organizer)', message: "I'm throwing my daughter's 8th birthday party at home on " + inDays(20) + ', about 12 kids' },
  { name: 'Guest at a wedding', message: `My cousin's wedding in Bruges on ${inDays(35)}, I'm just a guest` },
  { name: 'Dinner at home', message: `Hosting dinner for 6 friends on ${inDays(9)}, one is vegetarian` },
  { name: 'Work deadline', message: `Quarterly report due ${inDays(14)}, my manager has to approve the slide deck first` },
  { name: 'Festival', message: `Going to Tomorrowland with 3 friends, ${inDays(60)} to ${inDays(62)}, camping` },
  { name: 'Terse date', message: '14DECEMBER dentist appointment' },
  { name: 'Declined item', message: `Weekend in Paris ${inDays(30)} to ${inDays(32)} by train, no hotel needed, staying with friends` },
  { name: 'Edit existing plan', message: 'We also want to rent a car for a day trip to Sintra', existingEvent: existingTrip },
];

interface Run {
  ms: number;
  model?: string;
  title?: string;
  dates?: string;
  level?: string;
  tasks: { date: string; title: string; subs: string[] }[];
  reply?: string;
  error?: string;
}

async function runOne(c: Case, variant: PlannerPromptVariant): Promise<Run> {
  const started = Date.now();
  const log = console.info;
  let model: string | undefined;
  // processWithGemini logs "Planner call: { model }" - capture it.
  console.info = (...args: unknown[]) => {
    const info = args[1] as { model?: string } | undefined;
    if (args[0] === 'Planner call:' && info?.model) model = info.model;
  };
  try {
    const result = await processWithGemini({
      message: c.message,
      currentReferenceDate: refIso,
      refDateStr: refDate,
      activeEvents: c.existingEvent ? [c.existingEvent] : [],
      existingEvent: c.existingEvent,
      userProfile: c.userProfile,
      promptVariant: variant,
    });
    const ev = result.event;
    return {
      ms: Date.now() - started,
      model,
      title: ev.title,
      dates: ev.endDate ? `${ev.eventDate} to ${ev.endDate}` : ev.eventDate,
      level: ev.preparationLevel,
      tasks: (ev.milestones || [])
        .filter((m) => m.isActive !== false)
        .map((m) => ({ date: m.calculatedDate, title: m.title + (m.status === 'completed' ? ' (done)' : ''), subs: (m.deliverables || []).map((d) => d.title) })),
      reply: [result.focusText, result.additionText].filter(Boolean).join(' / '),
    };
  } catch (err: any) {
    return { ms: Date.now() - started, tasks: [], error: err?.message || String(err) };
  } finally {
    console.info = log;
  }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

function renderRun(r: Run): string {
  if (r.error) return `<p class="err">Failed: ${esc(r.error)}</p>`;
  return `<p class="meta"><b>${(r.ms / 1000).toFixed(1)}s</b> · ${esc(r.model || 'fallback template')} · ${esc(r.level)}</p>
<p class="ttl">${esc(r.title)} <span>${esc(r.dates)}</span></p>
<ol>${r.tasks.map((t) => `<li><span class="d">${esc(t.date)}</span> ${esc(t.title)}${t.subs.length ? `<ul>${t.subs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>
<p class="reply">${esc(r.reply)}</p>`;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set.');
    process.exit(1);
  }
  const out = process.argv[2] || 'planner-comparison.html';
  const rows: { c: Case; full: Run; lean: Run }[] = [];
  for (const c of CASES) {
    process.stdout.write(`${c.name}… `);
    const full = await runOne(c, 'full');
    const lean = await runOne(c, 'lean');
    console.log(`full ${(full.ms / 1000).toFixed(1)}s, lean ${(lean.ms / 1000).toFixed(1)}s`);
    rows.push({ c, full, lean });
  }
  const avg = (k: 'full' | 'lean') => rows.reduce((sum, r) => sum + r[k].ms, 0) / rows.length / 1000;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Planner Prompt Comparison</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202c;--muted:#5b6675;--line:#dfe3e8;--accent:#1f6f5c}
@media (prefers-color-scheme:dark){:root{--bg:#10151b;--card:#18202a;--ink:#e6ebf0;--muted:#9aa6b3;--line:#2a3542;--accent:#6fc2a8}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px}.sum{color:var(--muted);margin:0 0 16px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
h2{font-size:15px;margin:0 0 4px}.msg{color:var(--muted);white-space:pre-wrap;margin:0 0 10px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media (max-width:700px){.cols{grid-template-columns:1fr}}
.col h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);margin:0 0 6px}
.meta{margin:0 0 4px;color:var(--muted)}.ttl{font-weight:600;margin:0 0 6px}.ttl span{font-weight:400;color:var(--muted)}
ol{padding-left:18px;margin:0}ol>li{margin-bottom:4px}ul{margin:2px 0 0;padding-left:16px;color:var(--muted)}
.d{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted)}.reply{color:var(--muted);font-style:italic;margin:8px 0 0}.err{color:#c0392b}
</style></head><body>
<h1>Planner prompt comparison</h1>
<p class="sum">${rows.length} messages · average full ${avg('full').toFixed(1)}s · average lean ${avg('lean').toFixed(1)}s · reference date ${refDate}</p>
${rows.map(({ c, full, lean }) => `<section><h2>${esc(c.name)}</h2><p class="msg">${esc(c.message)}</p>
<div class="cols"><div class="col"><h3>Full prompt</h3>${renderRun(full)}</div><div class="col"><h3>Lean prompt</h3>${renderRun(lean)}</div></div></section>`).join('\n')}
</body></html>`;
  fs.writeFileSync(out, html);
  console.log(`\nWrote ${out}`);
  process.exit(0);
}

main();
