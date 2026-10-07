import { Type } from '@google/genai';
import { processWithGemini, processWithDeterministicRules, applyExtensiveRunUps, generateContentFast } from './agentProcessor.js';
import { snapshotFromEvent, sharePlan, sharedPlanUrl, type SharedPlanSnapshot } from './sharedPlans.js';
import { isEmailConfigured, sendEmail } from './emailService.js';
import { TelegramService } from './telegramService.js';

/**
 * "T-minus Tuesday" (docs: the Marketing Runway): every Monday, one example
 * plan for one of the four target groups, built by the real planner,
 * published as a shared plan (the link the post points to), with a
 * draft for each channel in the voice that channel rewards. It goes to the
 * owner only - by email (everything) and Telegram (heads-up) - to review
 * and post by hand: Reddit and friends punish automated posting, and the
 * drafts are meant to sound personal.
 */

interface Example {
  key: string;
  audience: 'Juggling parent' | 'Launch owner' | 'DIY wedding planner' | 'Telegram tinkerer';
  /** What it is, without the date (exampleMessage adds an exact one). */
  message: string;
  /** How far ahead it is, in weeks from the Monday it runs. */
  weeksOut: number;
  /** For trips and multi-day events. */
  nights?: number;
  channels: string[];
}

/** One per week, in turn. */
export const WEEKLY_EXAMPLES: Example[] = [
  { key: 'wedding', audience: 'DIY wedding planner', weeksOut: 39, message: 'Our wedding at a vineyard, about 80 guests, ceremony and reception in one place', channels: ['r/weddingplanning', 'Pinterest'] },
  { key: 'school-day', audience: 'Juggling parent', weeksOut: 3, message: 'Book week costume day at school for my 7-year-old', channels: ['r/Mommit', 'Pinterest'] },
  { key: 'launch', audience: 'Launch owner', weeksOut: 6, message: 'Mobile app v2.0 launch, needs legal review, app store review and a launch email', channels: ['LinkedIn', 'r/ProductManagement'] },
  { key: 'family-trip', audience: 'Juggling parent', weeksOut: 8, nights: 5, message: 'Family trip to Lisbon with two kids, flying', channels: ['r/familytravel', 'Pinterest'] },
  { key: 'surprise-40th', audience: 'Juggling parent', weeksOut: 5, message: 'Surprise 40th birthday dinner for my partner, about 12 friends at a restaurant', channels: ['r/organization', 'Pinterest'] },
  { key: 'offsite', audience: 'Launch owner', weeksOut: 7, nights: 1, message: 'Two-day team offsite for 15 people outside the city', channels: ['LinkedIn', 'r/managers'] },
  { key: 'house-move', audience: 'Juggling parent', weeksOut: 10, message: 'Moving house with two kids and a dog', channels: ['r/organization', 'Pinterest'] },
  { key: 'conference-talk', audience: 'Launch owner', weeksOut: 6, message: 'Giving a 30-minute talk at a conference, travelling there the day before', channels: ['LinkedIn', 'Show HN'] },
  { key: 'swim-meet', audience: 'Juggling parent', weeksOut: 4, message: "My daughter's first swimming competition, away from home, early start", channels: ['r/daddit', 'Pinterest'] },
  { key: 'housewarming', audience: 'Telegram tinkerer', weeksOut: 6, message: 'Housewarming party for 25 people at our new place, two vegetarians', channels: ['r/productivity', 'Telegram'] },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const spell = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** The example's message with an exact date (both planners read those reliably). */
export function exampleMessage(example: Example, now: Date): string {
  // A Saturday that many weeks out: most of these happen on a weekend.
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + example.weeksOut * 7));
  day.setUTCDate(day.getUTCDate() + ((6 - day.getUTCDay() + 7) % 7));
  if (!example.nights) return `${example.message} on ${spell(day)}`;
  const end = new Date(day.getTime() + example.nights * 86_400_000);
  // "from 28 November to 3 December 2026": the year once, at the end.
  const start = `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}${day.getUTCFullYear() !== end.getUTCFullYear() ? ` ${day.getUTCFullYear()}` : ''}`;
  return `${example.message}, from ${start} to ${spell(end)}`;
}

export interface ChannelDraft {
  channel: string;
  title?: string;
  body: string;
}

export interface WeeklyPackage {
  week: string;
  example: Example;
  plan: SharedPlanSnapshot;
  link: string;
  drafts: ChannelDraft[];
  usedAi: boolean;
}

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7) };
}

export function exampleForWeek(now: Date): { example: Example; weekLabel: string } {
  const { year, week } = isoWeek(now);
  return { example: WEEKLY_EXAMPLES[(year * 53 + week) % WEEKLY_EXAMPLES.length], weekLabel: `${year}-W${String(week).padStart(2, '0')}` };
}

async function buildPlan(example: Example, now: Date): Promise<{ plan: SharedPlanSnapshot; usedAi: boolean }> {
  const refDateISO = now.toISOString();
  const refDateStr = refDateISO.slice(0, 10);
  let result;
  let usedAi = false;
  if (process.env.GEMINI_API_KEY) {
    try {
      result = await processWithGemini({ message: exampleMessage(example, now), currentReferenceDate: refDateISO, refDateStr, activeEvents: [] });
      usedAi = true;
    } catch (err) {
      console.warn('Weekly content: AI planner unavailable, using the built-in planner:', err);
    }
  }
  if (!result) result = processWithDeterministicRules({ message: exampleMessage(example, now), refDateStr, refDateISO });
  const event = applyExtensiveRunUps(result, refDateISO).event;
  const plan = snapshotFromEvent(event);
  if (!plan) throw new Error('The example plan came out without a title or date.');
  return { plan, usedAi };
}

/** The first steps, each with its first idea when that idea is its own (not repeated across steps). */
const stepsList = (plan: SharedPlanSnapshot, n = 5) => {
  const steps = plan.steps.slice(0, n);
  const counts = new Map<string, number>();
  for (const st of steps) if (st.ideas[0]) counts.set(st.ideas[0], (counts.get(st.ideas[0]) || 0) + 1);
  return steps.map((st) => `- ${st.title}${st.ideas[0] && counts.get(st.ideas[0]) === 1 ? ` (e.g. ${st.ideas[0]})` : ''}`).join('\n');
};

/** Plain drafts when the AI isn't available: still usable, just plainer. */
function templateDrafts(example: Example, plan: SharedPlanSnapshot, link: string): ChannelDraft[] {
  const first = plan.steps[0];
  return [
    {
      channel: 'Reddit',
      title: `Working backwards from the date: the prep list for "${plan.title}"`,
      body: `I stopped remembering prep steps the week of and started working backwards from the date instead. For this one, the first thing to do is "${first?.title || 'decide the basics'}", well before anything else. The rest:\n\n${stepsList(plan)}\n\nI put the whole plan here if it helps anyone: ${link} (made with a free tool, no sign-up needed to look).`,
    },
    {
      channel: 'LinkedIn',
      body: `Most deadlines don't slip on the day itself - they slip weeks earlier, at a step nobody put in the calendar.\n\nExample: "${plan.title}". Working backwards from the date, the first step is "${first?.title || ''}". The full runway:\n\n${stepsList(plan)}\n\nThe whole plan, with the dates: ${link}`,
    },
    {
      channel: 'Pinterest',
      title: `${plan.title}: the prep timeline`,
      body: `Every step to prepare, worked backwards from the date - with ideas for each one. ${link}`,
    },
  ];
}

async function aiDrafts(example: Example, message: string, plan: SharedPlanSnapshot, link: string): Promise<ChannelDraft[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const prompt = `You write social posts for a small free app, Ahead Of Time, that plans the preparation for an event backwards from its date. Write ONE post per channel below about this example plan, for this audience: ${example.audience}.

Rules:
- Reddit: method first, genuinely useful on its own (the lead times, what people forget), personal "here's what worked for me" voice; mention the tool only in the last sentence, low-key, with the link. No marketing words.
- LinkedIn: a short first-person story about a deadline that slipped because a prep step started too late, then the lesson, then the example plan link. No hashtag walls (max 2).
- Pinterest: a pin title (max 90 characters) and a description (max 300 characters) with the link.
- Use only facts from the plan below. Plain English. The link is: ${link}

Example: ${message}
Plan: ${plan.title} on ${plan.eventDate}
Steps:
${plan.steps.map((s) => `- ${s.date}: ${s.title}${s.ideas.length ? ` (ideas: ${s.ideas.join('; ')})` : ''}`).join('\n')}`;
  try {
    const { text } = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reddit_title: { type: Type.STRING },
              reddit_body: { type: Type.STRING },
              linkedin_body: { type: Type.STRING },
              pinterest_title: { type: Type.STRING },
              pinterest_body: { type: Type.STRING },
            },
            required: ['reddit_title', 'reddit_body', 'linkedin_body', 'pinterest_title', 'pinterest_body'],
          },
        },
      }),
      undefined,
      20000
    );
    const d = JSON.parse(text);
    const cap = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
    const drafts: ChannelDraft[] = [
      { channel: 'Reddit', title: cap(d.reddit_title, 300), body: cap(d.reddit_body, 4000) },
      { channel: 'LinkedIn', body: cap(d.linkedin_body, 3000) },
      { channel: 'Pinterest', title: cap(d.pinterest_title, 100), body: cap(d.pinterest_body, 500) },
    ];
    return drafts.every((x) => x.body) ? drafts : null;
  } catch (err) {
    console.warn('Weekly content: AI drafts unavailable, using templates:', err);
    return null;
  }
}

/** No AI this week: a template plan isn't good enough to post. */
export class WeeklyContentSkipped extends Error {
  constructor(public week: string, public exampleTitle: string) {
    super('The AI planner was not available, so no example plan was published.');
    this.name = 'WeeklyContentSkipped';
  }
}

export async function buildWeeklyPackage(opts: { appUrl: string; now?: Date; dryRun?: boolean }): Promise<WeeklyPackage> {
  const now = opts.now || new Date();
  const { example, weekLabel } = exampleForWeek(now);
  const { plan, usedAi } = await buildPlan(example, now);
  // The built-in planner's plans are generic (a housewarming gets birthday
  // steps): never publish one as marketing. A preview still shows it.
  if (!usedAi && !opts.dryRun) throw new WeeklyContentSkipped(weekLabel, plan.title);
  const token = opts.dryRun ? 'dry-run' : await sharePlan(null, `weekly-${weekLabel}`, plan);
  const link = sharedPlanUrl(opts.appUrl, token);
  const drafts = (await aiDrafts(example, exampleMessage(example, now), plan, link)) || templateDrafts(example, plan, link);
  return { week: weekLabel, example, plan, link, drafts, usedAi };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderWeeklyEmail(p: WeeklyPackage): { subject: string; html: string; text: string } {
  const subject = `T-minus Tuesday ${p.week}: ${p.plan.title}`;
  const text = [
    `This week's example (${p.example.audience}): ${p.plan.title}`,
    `Shared plan (what the posts link to): ${p.link}`,
    `Suggested channels: ${p.example.channels.join(', ')}`,
    '',
    ...p.drafts.flatMap((d) => [`--- ${d.channel} ---`, ...(d.title ? [d.title, ''] : []), d.body, '']),
    'Review, adjust and post by hand. Nothing was posted automatically.',
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#182A42">
<p style="font-weight:900;color:#447463;margin:0 0 4px">T-minus Tuesday · ${esc(p.week)}</p>
<h1 style="font-size:20px;margin:0 0 6px">${esc(p.plan.title)}</h1>
<p style="color:#475569;font-size:14px;margin:0 0 4px">For: ${esc(p.example.audience)} · Post on: ${esc(p.example.channels.join(', '))}</p>
<p style="margin:12px 0 18px"><a href="${esc(p.link)}" style="display:inline-block;background:#182A42;color:#fff;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none">Open the example plan</a></p>
${p.drafts
  .map(
    (d) => `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:0 0 12px">
<p style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 6px">${esc(d.channel)}</p>
${d.title ? `<p style="font-weight:700;margin:0 0 6px">${esc(d.title)}</p>` : ''}
<p style="white-space:pre-wrap;font-size:14px;line-height:1.5;margin:0">${esc(d.body)}</p></div>`
  )
  .join('\n')}
<p style="color:#94a3b8;font-size:12px">Drafts${p.usedAi ? ' and plan' : ''} written ${p.usedAi ? 'with AI' : 'from templates'} - review before posting. Nothing was posted automatically.</p></div>`;
  return { subject, html, text };
}

/** Sends the package to the owner: full email + Telegram heads-up. */
export async function deliverWeeklyPackage(p: WeeklyPackage): Promise<{ email: boolean; telegram: boolean }> {
  const ownerEmail = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAILS || '').split(',')[0].trim();
  let email = false;
  if (ownerEmail && isEmailConfigured()) {
    const sent = await sendEmail({ to: ownerEmail, ...renderWeeklyEmail(p) }).catch(() => ({ ok: false }));
    email = sent.ok;
  }
  let telegram = false;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
  if (chatId) {
    const reddit = p.drafts.find((d) => d.channel === 'Reddit');
    const msg = [
      `🗓️ T-minus Tuesday ${p.week} is ready`,
      `${p.plan.title} (for: ${p.example.audience})`,
      `Plan: ${p.link}`,
      reddit?.title ? `Reddit title: ${reddit.title}` : '',
      email ? 'All drafts are in your email.' : 'Email delivery is not set up - drafts below.',
      ...(email ? [] : p.drafts.map((d) => `\n— ${d.channel} —\n${d.title ? `${d.title}\n` : ''}${d.body}`)),
    ]
      .filter(Boolean)
      .join('\n');
    const res = await TelegramService.sendMessage(chatId, msg.slice(0, 4000), { parse_mode: null }).catch(() => ({ ok: false }));
    telegram = Boolean(res.ok);
  }
  return { email, telegram };
}

/** Tells the owner (Telegram) that this week's package was skipped, and why. */
export async function deliverWeeklySkipNotice(err: WeeklyContentSkipped): Promise<boolean> {
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) return false;
  const msg = `🗓️ T-minus Tuesday ${err.week} skipped: the AI planner wasn't available, and a template plan isn't good enough to post. Run the weekly content preview again later (see docs/owner-todo.md).`;
  const res = await TelegramService.sendMessage(chatId, msg, { parse_mode: null }).catch(() => ({ ok: false }));
  return Boolean(res.ok);
}
