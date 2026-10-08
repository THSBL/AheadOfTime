import crypto from 'crypto';
import { Type } from '@google/genai';
import { query } from './db.js';
import { appOrigin } from './appOrigin.js';
import { verifyRequestUser } from './requestAuth.js';
import { isAdminEmail } from './googleAuthVerify.js';
import { askRefinementQuestions, processWithGemini, applyExtensiveRunUps, generateContentFast } from './agentProcessor.js';
import { composeConversationBrief } from '../src/utils/refinementQuestions.js';
import { snapshotFromEvent, sharePlan, sharedPlanUrl, type SharedPlanSnapshot } from './sharedPlans.js';
import { datePhrase, exampleForWeek } from './weeklyContent.js';
import { isEmailConfigured, sendEmail } from './emailService.js';
import { TelegramService } from './telegramService.js';
import { drawPersona, personaLine, personaProfile, recentGuestOf, type Persona } from './blogPersonas.js';

/**
 * "T-minus Talks": a short weekly post for the blog (/blog).
 *
 * Two kinds, both run through the REAL app (request, the app's own
 * follow-up questions, the plan the real planner makes), so nobody can make
 * up what the app did:
 * - Reader question (preferred): the owner pastes a question someone asked
 *   online (Reddit, a forum) on /admin/blog. It's retold in our own words
 *   with names, places and details changed - never quoted, never linked on
 *   the page - and the post shows how to plan it. The owner also gets a
 *   draft reply for the original thread, to post by hand.
 * - Invented guest (the weekly fallback): a fictional person
 *   (server/blogPersonas.ts) and a 2-4 line exchange with Tess, the host.
 * Posts are short: the situation, the plan, the three lead times that
 * matter, one thing the app couldn't do.
 *
 * Nothing is published by itself: the owner gets the draft by email and
 * Telegram with a review link (Publish / Skip). Every post says where it
 * came from (a retold question, or an AI persona).
 *
 * The work is split into steps, saved after each one, because a cron run
 * has 60 seconds: the daily cron advances this week's episode as far as
 * its time allows, and the next run carries on. /admin/blog runs it on
 * demand. Manual run: /api/cron/blog-episode (see docs/owner-todo.md).
 */

export const SERIES = 'T-minus Talks';
export const HOST = { name: 'Tess', bio: `host of ${SERIES}, the conversation series of Ahead Of Time` };

/** What the app really does - the only features either agent may mention. */
const APP_FACTS = `Facts about Ahead Of Time (mention only these, never invent others):
- You describe an event in a sentence (typed, by voice, or to the Telegram bot). It asks a few quick questions, then builds the preparation backwards from the date: steps with dates and a couple of ideas per step.
- The steps go straight into Google Calendar, or into Outlook or Apple Calendar through a calendar link you subscribe to once.
- Reminders and a daily or weekly overview come by Telegram or by email.
- Bookings a group decides on are split into "Explore & share options" and later "Decide & book", so the group has time to choose.
- A plan can be shared as a read-only link.
- It's free, and you can try it without signing up at aheadoftime.app/try.`;

export interface Turn {
  speaker: 'host' | 'guest';
  text: string;
}

export interface EpisodeState {
  /** What the guest typed into the app. */
  request?: string;
  /** The app's follow-up questions ([] when it had none). */
  questions?: Array<{ question: string; options: string[] }>;
  answers?: Array<{ question: string; answer: string }>;
  plan?: SharedPlanSnapshot;
  shareToken?: string;
  transcript: Turn[];
  /** A real question the owner pasted (private: never shown on the page). */
  source?: { text: string; url: string | null };
  /** That question retold in our own words, as the person to plan for. */
  retold?: { situation: string; persona: Persona };
}

export interface LeadTime {
  /** "5 weeks before" */
  when: string;
  what: string;
  why: string;
}

export interface BlogPost {
  /** 2: the short format (situation, plan, lead times). Older posts have none. */
  format?: 2;
  title: string;
  description: string;
  /** The situation, in 2-3 sentences. */
  intro: string;
  /** Invented guests only: the best 2-4 lines of the chat with the host. */
  exchange?: Turn[];
  leadTimes?: LeadTime[];
  /** One honest thing the app couldn't do here. */
  limitation?: string;
  /** Reader questions only: a draft reply for the original thread (owner only). */
  reply?: string;
  /** First-format posts: the edited conversation and takeaways. */
  sections?: Array<{ heading: string; lines: Turn[] }>;
  takeaways?: string[];
  /** The criticism, for the owner only - never on the page. */
  productNotes: string[];
}

export type EpisodeStatus = 'drafting' | 'review' | 'published' | 'skipped' | 'failed';

export interface Episode {
  id: number;
  week: string;
  status: EpisodeStatus;
  persona: Persona;
  state: EpisodeState;
  post: BlogPost | null;
  slug: string | null;
  createdAt: string;
  publishedAt: string | null;
  /** The owner's own words on the conversation, written on the review page. */
  ownerNote: string | null;
  /** Who reviewed it ("Reviewed by"), from the review page. */
  reviewer: Reviewer | null;
}

export interface Reviewer {
  name: string;
  bio: string;
}

// ---------------------------------------------------------------- storage

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = query(
      `CREATE TABLE IF NOT EXISTS blog_episodes (
         id            SERIAL PRIMARY KEY,
         week          TEXT NOT NULL UNIQUE,
         status        TEXT NOT NULL DEFAULT 'drafting',
         persona       JSONB NOT NULL,
         state         JSONB NOT NULL DEFAULT '{"transcript":[]}',
         post          JSONB,
         slug          TEXT UNIQUE,
         errors        INT NOT NULL DEFAULT 0,
         last_error    TEXT,
         created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
         delivered_at  TIMESTAMPTZ,
         published_at  TIMESTAMPTZ
       )`
    )
      // Added after the first version of the table.
      .then(() => query(`ALTER TABLE blog_episodes ADD COLUMN IF NOT EXISTS owner_note TEXT, ADD COLUMN IF NOT EXISTS reviewer JSONB`))
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
function rowToEpisode(r: any): Episode {
  return {
    id: r.id,
    week: r.week,
    status: r.status,
    persona: r.persona,
    state: { transcript: [], ...(r.state || {}) },
    post: r.post || null,
    slug: r.slug,
    createdAt: iso(r.created_at)!,
    publishedAt: iso(r.published_at),
    ownerNote: r.owner_note || null,
    reviewer: r.reviewer?.name ? r.reviewer : null,
  };
}

/** The last reviewer's name and line, to prefill the next review. */
async function lastReviewer(): Promise<Reviewer | null> {
  const rows = await query<{ reviewer: Reviewer }>(`SELECT reviewer FROM blog_episodes WHERE reviewer IS NOT NULL ORDER BY updated_at DESC LIMIT 1`);
  return rows[0]?.reviewer || null;
}

/** The note keeps its paragraphs; everything else is one trimmed line. */
export function cleanOwnerInput(body: any): { note: string | null; reviewer: Reviewer | null } {
  const note = typeof body?.note === 'string' ? body.note.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 800) : '';
  const line = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const name = line(body?.reviewer_name, 60);
  return { note: note || null, reviewer: name ? { name, bio: line(body?.reviewer_bio, 140) } : null };
}

async function getEpisode(id: number): Promise<Episode | null> {
  await ensureSchema();
  const rows = await query(`SELECT * FROM blog_episodes WHERE id = $1`, [id]);
  return rows[0] ? rowToEpisode(rows[0]) : null;
}

export async function listPublished(limit = 50): Promise<Episode[]> {
  await ensureSchema();
  const rows = await query(`SELECT * FROM blog_episodes WHERE status = 'published' ORDER BY published_at DESC LIMIT $1`, [limit]);
  return rows.map(rowToEpisode);
}

async function getPublishedBySlug(slug: string): Promise<Episode | null> {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  await ensureSchema();
  const rows = await query(`SELECT * FROM blog_episodes WHERE slug = $1 AND status = 'published'`, [slug]);
  return rows[0] ? rowToEpisode(rows[0]) : null;
}

// ---------------------------------------------------------------- the steps

/** The host's two questions (invented guests only; a reader question has no chat). */
export const AGENDA = [
  'Ask, in one short question, what makes this tricky for them.',
  'Ask, in one short question, what they make of the plan: what helps, and what is missing for someone like them.',
];
/** host, guest, host, guest. */
export const TRANSCRIPT_LENGTH = AGENDA.length * 2;
const talkLength = (s: EpisodeState) => (s.source ? 0 : TRANSCRIPT_LENGTH);

/** The question can't become a post (not about planning something coming up). */
export class UnusableQuestion extends Error {
  constructor(reason: string) {
    super(reason || "That question isn't about planning something coming up.");
    this.name = 'UnusableQuestion';
  }
}

export interface EpisodeDeps {
  now: Date;
  /** Model text (JSON text when a schema is given). */
  llm: (req: { system: string; prompt: string; schema?: any; timeoutMs?: number }) => Promise<string>;
  clarify: (message: string, persona: Persona, now: Date) => Promise<Array<{ question: string; options: string[] }>>;
  plan: (message: string, persona: Persona, now: Date) => Promise<SharedPlanSnapshot>;
  share: (episodeKey: string, plan: SharedPlanSnapshot) => Promise<string>;
  /** Milliseconds left in this run. */
  timeLeft: () => number;
  /** Called after every step, so a run that stops halfway loses nothing. */
  save: (state: EpisodeState) => Promise<void>;
}

/** Worst-case time a step may take (its model timeouts): it only starts when that much is left. */
const STEP_MS = { retell: 20_000, request: 20_000, clarify: 16_000, answers: 20_000, plan: 40_000, share: 3_000, turn: 20_000, edit: 30_000 };

const when = (p: Persona, now: Date) => datePhrase(p.scenario.weeksOut, p.scenario.nights, now);

function guestBrief(p: Persona, now: Date): string {
  const life = p.story
    ? `Your situation: ${p.story}`
    : `How you plan: ${p.planningStyle}. Your complication: ${p.constraint}. Your manner: ${p.temperament}.`;
  return `You are ${p.name}, ${p.age}, ${p.role}, living in ${p.city} (${p.householdDetail}). This is a fictional persona for a blog post; speak as this person, in the first person.
Coming up: ${p.scenario.event}, ${when(p, now)}.
${life}
You use ${p.calendar} and you get the app's updates by ${p.updates}.`;
}

const planText = (plan: SharedPlanSnapshot) =>
  `${plan.title} (${plan.eventDate}${plan.endDate ? ` to ${plan.endDate}` : ''})\n${plan.steps
    .map((s) => `- ${s.date}: ${s.title}${s.ideas.length ? ` (ideas: ${s.ideas.join('; ')})` : ''}`)
    .join('\n')}`;

const appExchange = (s: EpisodeState) =>
  [
    `What the guest typed into the app: "${s.request}"`,
    s.answers?.length ? `The app asked back, and the guest answered:\n${s.answers.map((a) => `- ${a.question} -> ${a.answer}`).join('\n')}` : 'The app asked no follow-up questions.',
  ].join('\n');

const transcriptText = (p: Persona, t: Turn[]) =>
  t.length ? t.map((x) => `${x.speaker === 'host' ? HOST.name : p.name}: ${x.text}`).join('\n\n') : '(nothing said yet)';

/** A turn as said: no "Tess:" label, quotes or stage directions; a sane length. */
export function cleanTurn(text: string, p: Persona): string {
  let t = String(text || '').trim();
  const label = new RegExp(`^\\**\\s*(${HOST.name}|${p.name}|Host|Guest)\\s*\\**\\s*:\\s*\\**`, 'i');
  t = t.replace(label, '').replace(/^\*+|\*+$/g, '').trim();
  t = t.replace(/^"([\s\S]*)"$/, '$1').replace(/\s*\([^)]*(laughs|pauses|smiles)[^)]*\)\s*/gi, ' ').trim();
  return t.length > 1200 ? `${t.slice(0, 1200).replace(/\s+\S*$/, '')}…` : t;
}

const RULES_GUEST = `Answer the host's last question in 25-60 words, natural spoken English, with concrete details from your life (invented, but consistent with your brief and what you said before). Be honest about the plan: if a step is unnecessary, too early, too late or something is missing for someone like you, say so - plainly, without drama. No generic praise, no marketing words, no lists. ${APP_FACTS}`;

const RULES_HOST = `You are ${HOST.name}, ${HOST.bio}. Ahead Of Time is a free app that plans the preparation for an event backwards from its date and puts the steps in your calendar. Your guest is a fictional AI persona who just used the app for a situation in their life; you both know that, no need to mention it. Style: warm, curious, a little dry, concrete. One short question, at most 30 words. Build on what the guest just said; quote the plan when it helps. Never answer for the guest. ${APP_FACTS}`;

/**
 * Advances an episode by as many steps as this run's time allows.
 * Returns the post once the editor has written it.
 */
export async function advanceEpisode(drawn: Persona, state: EpisodeState, episodeKey: string, deps: EpisodeDeps): Promise<{ state: EpisodeState; post: BlogPost | null }> {
  const s: EpisodeState = { ...state, transcript: [...(state.transcript || [])] };
  const fits = (ms: number) => deps.timeLeft() >= ms;

  // 0. A real question: retold in our own words, details changed.
  if (s.source && !s.retold) {
    if (!fits(STEP_MS.retell)) return { state: s, post: null };
    const raw = await deps.llm({
      system: `You retell questions people asked online for a planning blog, so that nobody can be identified: in your own words (never quote), no usernames, no links, and change names, places, exact numbers and dates while keeping what makes the situation hard. Plain English.`,
      prompt: `The question (as posted):\n---\n${s.source.text}\n---\n\nIf it is not about preparing for something coming up (an event, trip, move, deadline...), set usable=false and say why in reason. Otherwise describe the person and situation with changed details:
- situation: 2-3 sentences, max 60 words, what's coming up and what makes it tricky
- event: what's coming up, max 12 words, in their words ("my sister's hen weekend in Lisbon for 9 friends")
- weeksOut: how many weeks away it is (1-52; pick a plausible number if unknown); nights: 0 for one day, else the number of nights
- name (a different first name), age, role (job or life stage), city (a different city of similar size), household (single, couple or family_with_kids), householdDetail ("a partner and two kids (5 and 8)")`,
      schema: {
        type: Type.OBJECT,
        properties: {
          usable: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
          situation: { type: Type.STRING },
          event: { type: Type.STRING },
          weeksOut: { type: Type.INTEGER },
          nights: { type: Type.INTEGER },
          name: { type: Type.STRING },
          age: { type: Type.INTEGER },
          role: { type: Type.STRING },
          city: { type: Type.STRING },
          household: { type: Type.STRING },
          householdDetail: { type: Type.STRING },
        },
        required: ['usable', 'situation', 'event', 'weeksOut', 'nights', 'name', 'age', 'role', 'city', 'household', 'householdDetail'],
      },
    });
    const d = JSON.parse(raw);
    if (d.usable === false || !cap(d.situation, 600) || !cap(d.event, 200)) throw new UnusableQuestion(cap(d.reason, 200));
    s.retold = { situation: cap(d.situation, 600), persona: personaFromRetelling(d, drawn) };
    await deps.save(s);
  }
  const persona = s.retold?.persona || drawn;

  // 1. The guest's request, as they'd type it.
  if (!s.request) {
    if (!fits(STEP_MS.request)) return { state: s, post: null };
    const date = when(persona, deps.now);
    const text = await deps.llm({
      system: guestBrief(persona, deps.now),
      prompt: `You're opening a planning app's chat box to get ready for what's coming up. Write exactly what you type: one or two sentences, how you'd really type it (casual, no greeting). Include the date written exactly as "${date}". Mention one detail of your situation that matters for the planning. Don't mention any website or forum.`,
    });
    let request = cleanTurn(text, persona).slice(0, 400);
    if (!request.includes(date.replace(/^(on|from) /, ''))) request = `${request.replace(/[.\s]+$/, '')} - ${date}.`;
    s.request = request;
    await deps.save(s);
  }

  // 2. The app's own follow-up questions (the real ones), then the guest's answers.
  if (!s.questions) {
    if (!fits(STEP_MS.clarify)) return { state: s, post: null };
    s.questions = (await deps.clarify(s.request, persona, deps.now)).slice(0, 4);
    await deps.save(s);
  }
  if (!s.answers) {
    if (s.questions.length === 0) s.answers = [];
    else {
      if (!fits(STEP_MS.answers)) return { state: s, post: null };
      const raw = await deps.llm({
        system: guestBrief(persona, deps.now),
        prompt: `You typed: "${s.request}". The app asks you these questions. Answer each the way you'd tap or type it: pick one of the options when one fits, otherwise a short answer (max 15 words).\n${s.questions
          .map((q, i) => `${i}. ${q.question}${q.options.length ? ` [options: ${q.options.join(' | ')}]` : ''}`)
          .join('\n')}`,
        schema: {
          type: Type.OBJECT,
          properties: { answers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { index: { type: Type.INTEGER }, answer: { type: Type.STRING } }, required: ['index', 'answer'] } } },
          required: ['answers'],
        },
      });
      const parsed = JSON.parse(raw);
      s.answers = s.questions
        .map((q, i) => ({ question: q.question, answer: String(parsed.answers?.find((a: any) => a.index === i)?.answer || '').trim().slice(0, 120) }))
        .filter((a) => a.answer);
    }
    await deps.save(s);
  }

  // 3. The real plan, shared (the post links to it).
  if (!s.plan) {
    if (!fits(STEP_MS.plan)) return { state: s, post: null };
    s.plan = await deps.plan(composeConversationBrief({ originalMessage: s.request, answers: s.answers }), persona, deps.now);
    await deps.save(s);
  }
  if (!s.shareToken) {
    if (!fits(STEP_MS.share)) return { state: s, post: null };
    s.shareToken = await deps.share(episodeKey, s.plan);
    await deps.save(s);
  }

  // 4. The conversation, one turn per call.
  const intro = `Intro card: ${personaLine(persona)}; ${persona.householdDetail}; uses ${persona.calendar}; gets updates by ${persona.updates}.`;
  while (s.transcript.length < talkLength(s)) {
    if (!fits(STEP_MS.turn)) return { state: s, post: null };
    const hostTurn = s.transcript.length % 2 === 0;
    const material = `${appExchange(s)}\n\nThe plan the app made:\n${planText(s.plan)}\n\nThe conversation so far:\n${transcriptText(persona, s.transcript)}`;
    const text = hostTurn
      ? await deps.llm({ system: RULES_HOST, prompt: `${intro}\n\n${material}\n\nYour next line: ${AGENDA[s.transcript.length / 2]}` })
      : await deps.llm({ system: `${guestBrief(persona, deps.now)}\n\n${RULES_GUEST}`, prompt: `${material}\n\nYour answer to ${HOST.name}'s last question:` });
    const line = cleanTurn(text, persona).slice(0, 500);
    if (!line) throw new Error('An empty turn came back.');
    s.transcript.push({ speaker: hostTurn ? 'host' : 'guest', text: line });
    await deps.save(s);
  }

  // 5. The editor: everything -> a short post.
  if (!fits(STEP_MS.edit)) return { state: s, post: null };
  const question = Boolean(s.source);
  const raw = await deps.llm({
    system: `You write short, useful posts for the Ahead Of Time blog, for people facing the same kind of thing. Plain, warm, concrete English; no filler, no marketing words, no exclamation marks. Never add a claim, number or feature that isn't in the material below. The whole post (title to limitation) stays under 300 words.`,
    prompt: `${question ? `A reader question, retold with details changed: ${s.retold?.situation}` : `The guest: ${personaLine(persona)} (${persona.householdDetail}), a fictional AI persona. Host: ${HOST.name}.`}
Coming up: ${persona.scenario.event}.

${appExchange(s)}

The plan the app made:
${planText(s.plan)}
${question ? '' : `\nThe chat:\n${transcriptText(persona, s.transcript)}\n`}
Write:
- title: max 70 characters, specific and human, about the situation ("Planning a hen weekend for 9 when the group chat can't decide"); no clickbait, no colon-subtitle
- description: max 155 characters, for search results
- intro: the situation in 2-3 sentences, max 60 words${question ? ' (it is a retold reader question: "Someone asked us..." or "A reader is...")' : ''}
- exchange: ${question ? 'an empty list' : 'the best 2-4 lines of the chat, in order, trimmed to max 40 words each, speaker "host" or "guest"'}
- leadTimes: exactly 3, from the plan, the steps that matter most and when to start them: when ("5 weeks before"), what (max 10 words), why (one sentence, max 20 words)
- limitation: one honest sentence (max 30 words) about what the app couldn't do or doesn't know here
- productNotes: what was missing or off in the plan, as short notes for the product team (empty if nothing)
- reply: ${question ? 'a comment for the original thread that answers the question fully on its own: 60-140 words, first person as someone who builds a planning app - never claim to have lived this yourself (no "we did this last year") - 3-4 concrete steps with when to start each, friendly, no marketing words; end with exactly this line: "I make a free planner that works backwards from the date - I wrote this one up here: {LINK}"' : 'an empty string'}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        intro: { type: Type.STRING },
        exchange: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING } }, required: ['speaker', 'text'] } },
        leadTimes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { when: { type: Type.STRING }, what: { type: Type.STRING }, why: { type: Type.STRING } }, required: ['when', 'what', 'why'] } },
        limitation: { type: Type.STRING },
        productNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
        reply: { type: Type.STRING },
      },
      required: ['title', 'description', 'intro', 'exchange', 'leadTimes', 'limitation', 'productNotes', 'reply'],
    },
    timeoutMs: 25_000,
  });
  const post = sanitizePost(JSON.parse(raw), { question });
  if (!post) throw new Error('The editor returned an unusable post.');
  return { state: s, post };
}

/** The retold person, on top of a drawn persona (calendar, updates). */
export function personaFromRetelling(d: any, base: Persona): Persona {
  const int = (v: unknown, lo: number, hi: number, dflt: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : dflt);
  const household = d.household === 'single' || d.household === 'couple' || d.household === 'family_with_kids' ? d.household : base.household;
  const nights = int(d.nights, 0, 21, 0);
  return {
    ...base,
    name: cap(d.name, 30) || base.name,
    age: int(d.age, 18, 85, base.age),
    role: cap(d.role, 80) || base.role,
    city: cap(d.city, 40) || base.city,
    household,
    householdDetail: cap(d.householdDetail, 80) || base.householdDetail,
    story: cap(d.situation, 600),
    scenario: { key: 'reader-question', event: cap(d.event, 200), weeksOut: int(d.weeksOut, 1, 52, 6), ...(nights ? { nights } : {}) },
  };
}

const cap = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Only well-formed, bounded fields; null when there's not enough to publish. */
export function sanitizePost(d: any, opts: { question: boolean }): BlogPost | null {
  if (!d || typeof d !== 'object') return null;
  const exchange = opts.question
    ? []
    : ((Array.isArray(d.exchange) ? d.exchange : [])
        .map((l: any) => ({ speaker: l?.speaker === 'host' ? 'host' : l?.speaker === 'guest' ? 'guest' : null, text: cap(l?.text, 400) }))
        .filter((l: any) => l.speaker && l.text)
        .slice(0, 4) as Turn[]);
  const leadTimes: LeadTime[] = (Array.isArray(d.leadTimes) ? d.leadTimes : [])
    .map((l: any) => ({ when: cap(l?.when, 40), what: cap(l?.what, 120), why: cap(l?.why, 200) }))
    .filter((l: LeadTime) => l.when && l.what)
    .slice(0, 3);
  const reply = opts.question && typeof d.reply === 'string' ? d.reply.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500) : '';
  const post: BlogPost = {
    format: 2,
    title: cap(d.title, 90),
    description: cap(d.description, 170),
    intro: cap(d.intro, 600),
    ...(exchange.length ? { exchange } : {}),
    leadTimes,
    limitation: cap(d.limitation, 300),
    ...(reply ? { reply } : {}),
    productNotes: (Array.isArray(d.productNotes) ? d.productNotes : []).map((t: unknown) => cap(t, 300)).filter(Boolean).slice(0, 8),
  };
  const enoughChat = opts.question || exchange.length >= 2;
  return post.title && post.intro && leadTimes.length >= 2 && enoughChat ? post : null;
}

// ---------------------------------------------------------------- live deps

async function geminiText(req: { system: string; prompt: string; schema?: any; timeoutMs?: number }): Promise<string> {
  const { text } = await generateContentFast(
    () => ({
      contents: req.prompt,
      config: {
        systemInstruction: req.system,
        temperature: 0.9,
        ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
      },
    }),
    undefined,
    [req.timeoutMs ?? 12_000, 7_000]
  );
  return text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
}

function liveDeps(deadline: number, save: (s: EpisodeState) => Promise<void>, now = new Date()): EpisodeDeps {
  return {
    now,
    llm: geminiText,
    clarify: async (message, persona, at) => {
      const r = await askRefinementQuestions({ message, currentReferenceDate: at.toISOString(), userProfile: personaProfile(persona), useAi: true });
      return r.questions.map((q) => ({ question: q.question, options: q.options || [] }));
    },
    plan: async (message, persona, at) => {
      const refDateISO = at.toISOString();
      const result = await processWithGemini({ message, currentReferenceDate: refDateISO, refDateStr: refDateISO.slice(0, 10), activeEvents: [], userProfile: personaProfile(persona) });
      const plan = snapshotFromEvent(applyExtensiveRunUps(result, refDateISO).event);
      if (!plan || plan.steps.length < 3) throw new Error('The planner returned too thin a plan.');
      return plan;
    },
    share: (key, plan) => sharePlan(null, `blog-${key}`, plan),
    timeLeft: () => deadline - Date.now(),
    save,
  };
}

// ---------------------------------------------------------------- the weekly run

const MAX_ERRORS = 5;

/**
 * One run: carries on the episode being written, or starts this week's.
 * `deadline` is when this run must be done (epoch ms).
 */
export async function runBlogEpisode(opts: { appUrl: string; deadline: number; startNew?: boolean; now?: Date; /** A real question to write about (starts a new episode). */ source?: { text: string; url: string | null }; /** Tests: stand-ins for the AI calls. */ deps?: Partial<EpisodeDeps> }): Promise<{ status: string; week?: string; reviewUrl?: string; step?: string }> {
  if (!process.env.GEMINI_API_KEY && !opts.deps?.llm) return { status: 'skipped: no AI key (a conversation without the real planner is not worth posting)' };
  await ensureSchema();
  const now = opts.now || new Date();
  let row = opts.source ? undefined : (await query(`SELECT * FROM blog_episodes WHERE status = 'drafting' ORDER BY id DESC LIMIT 1`))[0];
  if (!row) {
    const { weekLabel } = exampleForWeek(now);
    const thisWeek = await query<{ week: string }>(`SELECT week FROM blog_episodes WHERE week = $1 OR week LIKE $2`, [weekLabel, `${weekLabel}-%`]);
    if (thisWeek.length && !opts.startNew && !opts.source) return { status: 'this week is done', week: weekLabel };
    const recent = await query<{ persona: Persona }>(`SELECT persona FROM blog_episodes ORDER BY id DESC LIMIT 8`);
    const persona = drawPersona(recent.map((r) => recentGuestOf(r.persona)));
    const week = thisWeek.length ? `${weekLabel}-${thisWeek.length + 1}` : weekLabel;
    const state: EpisodeState = { transcript: [], ...(opts.source ? { source: opts.source } : {}) };
    row = (await query(`INSERT INTO blog_episodes (week, persona, state) VALUES ($1, $2::jsonb, $3::jsonb) RETURNING *`, [week, JSON.stringify(persona), JSON.stringify(state)]))[0];
  }
  const ep = rowToEpisode(row);
  const save = (s: EpisodeState) => query(`UPDATE blog_episodes SET state = $2::jsonb, updated_at = now() WHERE id = $1`, [ep.id, JSON.stringify(s)]).then(() => undefined);
  try {
    const { state, post } = await advanceEpisode(ep.persona, ep.state, ep.week, { ...liveDeps(opts.deadline, save, now), ...opts.deps });
    if (!post) return { status: 'drafting', week: ep.week, step: describeStep(state) };
    // The address is settled now, so the draft reply can link to it.
    const slug = await uniqueSlug(post.title, ep.id);
    if (post.reply) post.reply = post.reply.replace('{LINK}', `${opts.appUrl}/blog/${slug}`);
    await query(`UPDATE blog_episodes SET post = $2::jsonb, slug = $3, status = 'review', persona = $4::jsonb, updated_at = now() WHERE id = $1`, [ep.id, JSON.stringify(post), slug, JSON.stringify(state.retold?.persona || ep.persona)]);
    const reviewUrl = reviewLink(opts.appUrl, ep.id);
    await deliverForReview({ ...ep, persona: state.retold?.persona || ep.persona, state, post, slug, status: 'review' }, opts.appUrl);
    await query(`UPDATE blog_episodes SET delivered_at = now() WHERE id = $1`, [ep.id]);
    return { status: 'ready for review', week: ep.week, reviewUrl: reviewUrl || undefined };
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 300);
    if (err instanceof UnusableQuestion) {
      // Retrying won't change the question.
      await query(`UPDATE blog_episodes SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [ep.id, message]);
      return { status: `not usable: ${message}`, week: ep.week };
    }
    const rows = await query<{ errors: number }>(`UPDATE blog_episodes SET errors = errors + 1, last_error = $2, updated_at = now() WHERE id = $1 RETURNING errors`, [ep.id, message]);
    if ((rows[0]?.errors || 0) >= MAX_ERRORS) {
      await query(`UPDATE blog_episodes SET status = 'failed' WHERE id = $1`, [ep.id]);
      await notifyOwnerTelegram(`📝 ${SERIES} ${ep.week} gave up after ${MAX_ERRORS} failed runs (last: ${message}). Next week starts fresh.`);
    }
    console.warn('Blog episode step failed:', message);
    return { status: `error (will retry): ${message}`, week: ep.week };
  }
}

function describeStep(s: EpisodeState): string {
  if (s.source && !s.retold) return 'retelling the question';
  if (!s.request) return 'writing the request';
  if (!s.answers) return 'answering the app';
  if (!s.plan || !s.shareToken) return 'planning';
  if (s.transcript.length < talkLength(s)) return `talking (${s.transcript.length}/${talkLength(s)} turns)`;
  return 'editing';
}

// ---------------------------------------------------------------- review links

const REVIEW_TTL_MS = 60 * 86_400_000;
const signature = (payload: string, secret: string) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

export function signReviewToken(id: number, now = Date.now()): string | null {
  const secret = process.env.NOTIFY_LINK_SECRET?.trim();
  if (!secret) return null;
  const exp = now + REVIEW_TTL_MS;
  return `${id}.${exp}.${signature(`blog-review.${id}.${exp}`, secret)}`;
}

export function verifyReviewToken(token: unknown): number | null {
  const secret = process.env.NOTIFY_LINK_SECRET?.trim();
  const m = typeof token === 'string' ? /^(\d{1,9})\.(\d{10,16})\.([0-9a-f]{64})$/.exec(token) : null;
  if (!secret || !m) return null;
  const [, id, exp, sig] = m;
  if (Date.now() > Number(exp)) return null;
  const expected = Buffer.from(signature(`blog-review.${id}.${exp}`, secret), 'hex');
  const given = Buffer.from(sig, 'hex');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? Number(id) : null;
}

const reviewLink = (appUrl: string, id: number) => {
  const k = signReviewToken(id);
  return k ? `${appUrl}/blog/review?k=${k}` : null;
};

// ---------------------------------------------------------------- delivery

async function notifyOwnerTelegram(text: string): Promise<boolean> {
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) return false;
  const res = await TelegramService.sendMessage(chatId, text.slice(0, 4000), { parse_mode: null }).catch(() => ({ ok: false }));
  return Boolean((res as any).ok);
}

async function deliverForReview(ep: Episode, appUrl: string): Promise<void> {
  const post = ep.post!;
  const link = reviewLink(appUrl, ep.id);
  const question = Boolean(ep.state.source);
  const who = question ? 'A reader question (retold, details changed)' : `Guest: ${personaLine(ep.persona)} (AI persona)`;
  const notes = post.productNotes.length ? post.productNotes : ['(nothing this week)'];
  const original = ep.state.source?.url || null;
  const ownerEmail = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAILS || '').split(',')[0].trim();
  let emailed = false;
  if (ownerEmail && isEmailConfigured()) {
    const text = [
      `${SERIES} ${ep.week} is ready to review.`,
      `"${post.title}"`,
      who,
      '',
      post.intro,
      '',
      'Product notes (not published):',
      ...notes.map((n) => `- ${n}`),
      ...(post.reply ? ['', `Draft reply for the original thread${original ? ` (${original})` : ''} - post it yourself, once the post is live:`, '', post.reply] : []),
      '',
      link ? `Read it, add a note of your own if you like, then publish or skip: ${link}` : 'NOTIFY_LINK_SECRET is not set, so there is no review link.',
      'Nothing is published until you tap Publish.',
    ].join('\n');
    const box = (label: string, inner: string) =>
      `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin:0 0 16px"><p style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 6px">${label}</p>${inner}</div>`;
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#182A42">
<p style="font-weight:900;color:#447463;margin:0 0 4px">${esc(SERIES)} · ${esc(ep.week)}</p>
<h1 style="font-size:20px;margin:0 0 6px">${esc(post.title)}</h1>
<p style="color:#475569;font-size:14px;margin:0 0 12px">${esc(who)}</p>
<p style="font-size:14px;line-height:1.55;margin:0 0 16px">${esc(post.intro)}</p>
${link ? `<p style="margin:0 0 16px"><a href="${esc(link)}" style="display:inline-block;background:#182A42;color:#fff;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none">Read it, add your note, then publish or skip</a></p>` : '<p>NOTIFY_LINK_SECRET is not set, so there is no review link.</p>'}
${post.reply ? box(`Draft reply for the original thread - post it yourself once the post is live${original ? ` · <a href="${esc(original)}">open the thread</a>` : ''}`, `<p style="white-space:pre-wrap;font-size:14px;line-height:1.5;margin:0">${esc(post.reply)}</p>`) : ''}
${box('Product notes (not published)', `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`)}
<p style="color:#94a3b8;font-size:12px">Nothing is published until you tap Publish.</p></div>`;
    const sent = await sendEmail({ to: ownerEmail, subject: `${SERIES}: ${post.title}`, html, text }).catch(() => ({ ok: false }));
    emailed = sent.ok;
  }
  await notifyOwnerTelegram(
    [`📝 ${SERIES} ${ep.week} is ready to review`, `"${post.title}"`, who, link ? `Review: ${link}` : '', emailed ? `Product notes${post.reply ? ' and the draft reply' : ''} are in your email.` : `Product notes:\n${notes.map((n) => `- ${n}`).join('\n')}`]
      .filter(Boolean)
      .join('\n')
  );
}

// ---------------------------------------------------------------- pages

export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70)
      .replace(/-+$/, '') || 'conversation'
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (isoString: string) => {
  const d = new Date(isoString);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const stepDate = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const DISCLOSURE = `Our guests are AI personas: fictional people we create to put Ahead Of Time through lives unlike our own. The plan in this post is the real one the app made for them.`;
const QUESTION_DISCLOSURE = `Based on a question someone asked online. We retold it in our own words and changed names, places and details, so it can't be traced back. The plan is the real one Ahead Of Time made for it.`;
const disclosureFor = (ep: Episode) => (ep.state.source ? QUESTION_DISCLOSURE : DISCLOSURE);

function layout(o: { appUrl: string; title: string; description: string; path: string; body: string; noindex?: boolean; jsonLd?: object }): string {
  const url = `${o.appUrl}${o.path}`;
  const ld = o.jsonLd ? `<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.description)}">
${o.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:type" content="article"><meta property="og:site_name" content="Ahead Of Time"><meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="https://aheadoftime.app/assets/aheadoftime-social-card-v3.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/blog.css">${ld}
<link rel="alternate" type="application/rss+xml" title="${SERIES}" href="/blog/feed.xml"></head>
<body><header class="top"><a href="/" class="brand"><img src="/icon-96.png" alt="">Ahead Of Time</a><nav><a href="/blog">${SERIES}</a><a href="/try" class="cta">Try it free</a></nav></header>
${o.body}
<footer class="foot"><p>© ${new Date().getUTCFullYear()} Ahead Of Time</p><nav><a href="/how-it-works">How it works</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a></nav></footer></body></html>`;
}

function personaCard(ep: Episode): string {
  const p = ep.persona;
  if (ep.state.source) {
    return `<aside class="guest-card"><p class="label">Reader question</p><p class="who">${esc(personaLine(p))}</p><p class="ai">Name and details changed · <a href="/blog#about">where our questions come from</a></p></aside>`;
  }
  return `<aside class="guest-card"><p class="label">This week's guest</p><p class="who">${esc(personaLine(p))}</p>
<ul><li>${esc(p.householdDetail[0].toUpperCase() + p.householdDetail.slice(1))}</li><li>Coming up: ${esc(p.scenario.event)}</li><li>Uses ${esc(p.calendar)}, updates by ${esc(p.updates)}</li></ul>
<p class="ai">AI persona · <a href="/blog#about">what this means</a></p></aside>`;
}

function planBox(plan: SharedPlanSnapshot, link: string | null): string {
  const shown = plan.steps.slice(0, 12);
  return `<section class="plan"><p class="label">The plan the app made</p><h2>${esc(plan.title)}</h2>
<p class="when">${esc(stepDate(plan.eventDate))}${plan.endDate ? ` – ${esc(stepDate(plan.endDate))}` : ''}</p>
<ol>${shown
    .map((s) => `<li><span class="date">${esc(stepDate(s.date))}</span><span class="step">${esc(s.title)}</span>${s.ideas.length ? `<span class="ideas">${esc(s.ideas.slice(0, 2).join(' · '))}</span>` : ''}</li>`)
    .join('')}</ol>
${plan.steps.length > shown.length ? `<p class="more">+ ${plan.steps.length - shown.length} more steps</p>` : ''}
${link ? `<a class="btn secondary" href="${esc(link)}">Open the full plan</a>` : ''}</section>`;
}

export function renderPostPage(ep: Episode, appUrl: string, review?: { token: string; reviewerDefault?: Reviewer | null }): string {
  const post = ep.post!;
  const p = ep.persona;
  const name = (t: Turn) => (t.speaker === 'host' ? HOST.name : p.name);
  const shareLink = ep.state.shareToken ? sharedPlanUrl(appUrl, ep.state.shareToken) : null;
  const date = longDate(ep.publishedAt || ep.createdAt);
  const bar = review ? reviewBar(ep, review.token, ep.reviewer || review.reviewerDefault || null) : '';
  const kind = ep.state.source ? 'Reader question' : "This week's guest";
  const lines = (ls: Turn[]) => ls.map((l) => `<p class="line ${l.speaker}"><span class="who">${esc(name(l))}</span>${esc(l.text)}</p>`).join('');
  const ownerNote = ep.ownerNote
    ? `<section class="owner-note"><p class="label">A note from ${esc(ep.reviewer?.name || 'the team')}</p>${ep.ownerNote.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('')}</section>`
    : '';
  const middle =
    post.format === 2
      ? `${post.exchange?.length ? `<section class="talk">${lines(post.exchange)}</section>` : ''}
${ep.state.plan ? planBox(ep.state.plan, shareLink) : ''}
${post.leadTimes?.length ? `<section class="takeaways"><h2>The ${post.leadTimes.length} lead times that matter</h2><ol class="leads">${post.leadTimes.map((l) => `<li><span class="when">${esc(l.when)}</span><span class="what">${esc(l.what)}</span>${l.why ? `<span class="why">${esc(l.why)}</span>` : ''}</li>`).join('')}</ol></section>` : ''}
${post.limitation ? `<p class="limit"><b>What the app couldn't do:</b> ${esc(post.limitation)}</p>` : ''}
${ownerNote}`
      : `${(post.sections || []).map((sec) => `<section class="talk"><h2>${esc(sec.heading)}</h2>${lines(sec.lines)}</section>`).join('\n')}
${ep.state.plan ? planBox(ep.state.plan, shareLink) : ''}
${ownerNote}
${post.takeaways?.length ? `<section class="takeaways"><h2>Takeaways</h2><ul>${post.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}`;
  const body = `${bar}<main class="post"><p class="kicker">${SERIES} · ${esc(kind)} · ${esc(date)}</p><h1>${esc(post.title)}</h1>
${ep.reviewer ? `<p class="byline">Reviewed by <b>${esc(ep.reviewer.name)}</b>${ep.reviewer.bio ? `, ${esc(ep.reviewer.bio)}` : ''}</p>` : ''}
<p class="intro">${esc(post.intro)}</p>${personaCard(ep)}
${middle}
<section class="try"><h2>Plan your own</h2><p>Tell it what's coming up and get the steps, backwards from the date. Free, no sign-up needed to try.</p><a class="btn" href="/try">Try it with your own event</a></section>
<p class="disclosure">${esc(disclosureFor(ep))}</p></main>`;
  return layout({
    appUrl,
    title: `${post.title} - ${SERIES}`,
    description: post.description || post.intro.slice(0, 155),
    path: `/blog/${ep.slug || ''}`,
    body,
    noindex: Boolean(review),
    jsonLd: review
      ? undefined
      : {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          datePublished: ep.publishedAt,
          mainEntityOfPage: `${appUrl}/blog/${ep.slug}`,
          image: 'https://aheadoftime.app/assets/aheadoftime-social-card-v3.png',
          author: { '@type': 'Organization', name: 'Ahead Of Time', url: appUrl },
          ...(ep.reviewer ? { editor: { '@type': 'Person', name: ep.reviewer.name, ...(ep.reviewer.bio ? { description: ep.reviewer.bio } : {}) } } : {}),
          publisher: { '@type': 'Organization', name: 'Ahead Of Time', logo: { '@type': 'ImageObject', url: 'https://aheadoftime.app/icon-512.png' } },
        },
  });
}

function reviewBar(ep: Episode, token: string, reviewer: Reviewer | null): string {
  const action = (value: string, label: string, cls = '') => `<button name="do" value="${value}" class="${cls}">${label}</button>`;
  const notes = ep.post?.productNotes.length ? `<details><summary>Product notes (never published)</summary><ul>${ep.post.productNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';
  const original = ep.state.source?.url;
  const reply = ep.post?.reply
    ? `<details class="reply"${ep.status === 'published' ? ' open' : ''}><summary>Draft reply for the original thread (post it yourself once this is live)</summary>${original ? `<p><a href="${esc(original)}" target="_blank" rel="noopener noreferrer">Open the original thread</a></p>` : ''}<textarea readonly rows="8">${esc(ep.post.reply)}</textarea></details>`
    : '';
  const [status, actions] =
    ep.status === 'published'
      ? [`<p><b>Live</b> at <a href="/blog/${esc(ep.slug || '')}">/blog/${esc(ep.slug || '')}</a></p>`, `${action('save', 'Save changes')}${action('unpublish', 'Unpublish', 'quiet')}`]
      : ep.status === 'skipped'
        ? [`<p><b>Skipped.</b> Only you can see this.</p>`, `${action('publish', 'Publish anyway')}${action('save', 'Save', 'quiet')}`]
        : [`<p><b>Draft</b> - only you can see this. Nothing is live until you publish.</p>`, `${action('publish', 'Publish')}${action('save', 'Save', 'quiet')}${action('skip', 'Skip this week', 'quiet')}`];
  return `<div class="review">${status}<form method="post" action="/blog/review" class="note-form"><input type="hidden" name="k" value="${esc(token)}">
<label for="note">Your note <span>(optional, shown as "A note from you" under the plan: what you'd do in their place, or what you're changing)</span></label>
<textarea id="note" name="note" rows="4" maxlength="800">${esc(ep.ownerNote || '')}</textarea>
<div class="row"><label>Your name <span>(shown as "Reviewed by")</span><input name="reviewer_name" maxlength="60" value="${esc(reviewer?.name || '')}"></label>
<label>One line about you<input name="reviewer_bio" maxlength="140" value="${esc(reviewer?.bio || '')}" placeholder="Founder of Ahead Of Time"></label></div>
<div class="actions">${actions}</div></form>${reply}${notes}</div>`;
}

export function renderIndexPage(posts: Episode[], appUrl: string): string {
  const list = posts.length
    ? `<ul class="list">${posts
        .map(
          (ep) => `<li><a href="/blog/${esc(ep.slug || '')}"><span class="date">${esc(longDate(ep.publishedAt || ep.createdAt))}</span><span class="t">${esc(ep.post!.title)}</span><span class="d">${esc(ep.post!.description)}</span><span class="g">${ep.state.source ? 'Reader question' : `Guest: ${esc(personaLine(ep.persona))} (AI persona)`}</span></a></li>`
        )
        .join('')}</ul>`
    : `<p class="empty">The first conversation is on its way.</p>`;
  return layout({
    appUrl,
    title: `${SERIES} - the Ahead Of Time blog`,
    description: "Short posts on planning what's coming up: real questions people asked, retold, and the plan Ahead Of Time made for them.",
    path: '/blog',
    body: `<main class="index"><p class="kicker">The Ahead Of Time blog</p><h1>${SERIES}</h1>
<p class="intro">Something coming up and no idea where to start? Every week we take one real situation, run it through Ahead Of Time, and show the plan: what to start first, and what the app couldn't do.</p>
${list}<section class="about" id="about"><h2>Where the posts come from</h2><p>Most start from a question someone asked online. We retell it in our own words and change names, places and details, so nobody can be identified, and we never quote or link the original. Some weeks the guest is an AI persona: a fictional person we create to put the app through lives unlike our own. Either way, the plan is the real one the app made, and what it got wrong goes straight to our product list.</p></section></main>`,
  });
}

function messagePage(appUrl: string, title: string, text: string, status = 200): { status: number; html: string } {
  return { status, html: layout({ appUrl, title: `${title} - ${SERIES}`, description: text, path: '/blog', noindex: true, body: `<main class="post"><h1>${esc(title)}</h1><p class="intro">${esc(text)}</p><a class="btn" href="/blog">All conversations</a></main>` }) };
}

export function renderSitemap(posts: Episode[], appUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${esc(appUrl)}/blog</loc><changefreq>weekly</changefreq></url>\n${posts
    .map((ep) => `<url><loc>${esc(appUrl)}/blog/${esc(ep.slug || '')}</loc><lastmod>${(ep.publishedAt || ep.createdAt).slice(0, 10)}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`;
}

export function renderFeed(posts: Episode[], appUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${SERIES} - Ahead Of Time</title><link>${esc(appUrl)}/blog</link><description>A weekly conversation about planning what's coming up.</description>\n${posts
    .map((ep) => `<item><title>${esc(ep.post!.title)}</title><link>${esc(appUrl)}/blog/${esc(ep.slug || '')}</link><guid>${esc(appUrl)}/blog/${esc(ep.slug || '')}</guid><pubDate>${new Date(ep.publishedAt || ep.createdAt).toUTCString()}</pubDate><description>${esc(ep.post!.description)}</description></item>`)
    .join('\n')}\n</channel></rss>\n`;
}

// ---------------------------------------------------------------- publish / skip

async function uniqueSlug(title: string, id: number): Promise<string> {
  const base = slugify(title);
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await query(`SELECT 1 FROM blog_episodes WHERE slug = $1 AND id <> $2`, [slug, id]);
    if (!taken.length) return slug;
    slug = `${base.slice(0, 64)}-${n}`;
  }
}

async function setStatus(id: number, action: string, body: any = {}): Promise<Episode | null> {
  const ep = await getEpisode(id);
  if (!ep || !ep.post) return ep;
  if (action === 'save' || action === 'publish') {
    const { note, reviewer } = cleanOwnerInput(body);
    await query(`UPDATE blog_episodes SET owner_note = $2, reviewer = $3::jsonb, updated_at = now() WHERE id = $1`, [id, note, reviewer ? JSON.stringify(reviewer) : null]);
  }
  if (action === 'publish' && ep.status !== 'published') {
    const slug = ep.slug || (await uniqueSlug(ep.post.title, id));
    await query(`UPDATE blog_episodes SET status = 'published', slug = $2, published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = $1`, [id, slug]);
  } else if (action === 'skip' && ep.status === 'review') {
    await query(`UPDATE blog_episodes SET status = 'skipped', updated_at = now() WHERE id = $1`, [id]);
  } else if (action === 'unpublish' && ep.status === 'published') {
    await query(`UPDATE blog_episodes SET status = 'review', updated_at = now() WHERE id = $1`, [id]);
  }
  return getEpisode(id);
}

// ---------------------------------------------------------------- the route

/**
 * The blog's pages (vercel.json sends /blog... here; server.ts has twins):
 *   GET  /blog                 - list of published conversations
 *   GET  /blog/<slug>          - one conversation
 *   GET  /blog/feed.xml        - RSS
 *   GET  /blog-sitemap.xml     - sitemap of the posts
 *   GET  /blog/review?k=...    - the owner's preview (signed link from the email)
 *   POST /blog/review k, do    - publish / skip / unpublish
 * Plain server-rendered HTML (styles in public/blog.css; no inline styles or
 * scripts, so the site's strict CSP applies unchanged).
 */
export async function handleBlog(req: any, res: any) {
  const q = req.query || {};
  const appUrl = appOrigin(req);
  const send = (status: number, html: string, type = 'text/html; charset=utf-8', cache = 'public, max-age=0, s-maxage=300') => {
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', cache);
    return res.status(status).send(html);
  };
  try {
    if (q.review) {
      res.setHeader('X-Robots-Tag', 'noindex');
      const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};
      const token = req.method === 'POST' ? body.k : q.k;
      const id = verifyReviewToken(token);
      if (!id) {
        const m = messagePage(appUrl, 'This review link has expired', 'Ask for a fresh one from the weekly email, or run the blog episode again.', 403);
        return send(m.status, m.html, undefined, 'no-store');
      }
      let ep = await getEpisode(id);
      if (req.method === 'POST') {
        const action = String(body.do || '');
        ep = await setStatus(id, action, body);
        res.statusCode = 303;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Location', action === 'publish' && ep?.status === 'published' && ep.slug ? `/blog/${ep.slug}` : `/blog/review?k=${encodeURIComponent(String(token))}`);
        return res.end();
      }
      if (!ep) {
        const m = messagePage(appUrl, 'Not found', 'This conversation no longer exists.', 404);
        return send(m.status, m.html, undefined, 'no-store');
      }
      if (!ep.post) {
        const m = messagePage(appUrl, 'Still being written', `This week's conversation is at: ${describeStep(ep.state)}. The next daily run carries on.`);
        return send(m.status, m.html, undefined, 'no-store');
      }
      return send(200, renderPostPage(ep, appUrl, { token: String(token), reviewerDefault: await lastReviewer() }), undefined, 'no-store');
    }
    if (q.sitemap) return send(200, renderSitemap(await listPublished(500), appUrl), 'application/xml; charset=utf-8');
    if (q.slug === 'feed.xml') return send(200, renderFeed(await listPublished(30), appUrl), 'application/rss+xml; charset=utf-8');
    if (q.slug) {
      const ep = await getPublishedBySlug(String(q.slug));
      if (!ep || !ep.post) {
        const m = messagePage(appUrl, 'Not found', "This conversation isn't here (any more).", 404);
        return send(m.status, m.html);
      }
      return send(200, renderPostPage(ep, appUrl));
    }
    return send(200, renderIndexPage(await listPublished(), appUrl));
  } catch (err: any) {
    console.error('Blog error:', err?.message || err);
    const m = messagePage(appUrl, 'The blog is not available right now', 'Try again in a minute.', 503);
    return send(m.status, m.html, undefined, 'no-store');
  }
}

// ---------------------------------------------------------------- admin page

export interface AdminEpisodeRow {
  id: number;
  week: string;
  status: EpisodeStatus;
  title: string | null;
  guest: string;
  step: string | null;
  kind: 'question' | 'guest';
  lastError: string | null;
  createdAt: string;
  publishedAt: string | null;
  url: string | null;
  reviewUrl: string | null;
}

/**
 * /api/cron/blog-admin (in the cron function for its 60 seconds), for the
 * /admin/blog page; admins only (ADMIN_EMAILS):
 *   GET            - every conversation, with its edit (review) link
 *   POST {startNew} - writes as far as one run allows: carries on the one
 *                     being written, or starts a new one; the page calls
 *                     again until it's ready for review.
 */
/**
 * A pasted question, made safe to keep: usernames, e-mail addresses and
 * links are taken out before anything else sees it. The thread link itself
 * is kept for the owner only (never on the page).
 */
export function cleanSource(text: unknown, url: unknown): { text: string; url: string | null } | null {
  if (typeof text !== 'string') return null;
  const clean = text
    .replace(/\r/g, '')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\/?\bu\/[A-Za-z0-9_-]+/g, 'someone')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000);
  if (clean.length < 60) return null;
  const link = typeof url === 'string' && /^https?:\/\/[^\s<>"']{3,490}$/i.test(url.trim()) ? url.trim() : null;
  return { text: clean, url: link };
}

export async function handleBlogAdmin(req: any, res: any, deadline: number) {
  res.setHeader('Cache-Control', 'no-store');
  const verified = await verifyRequestUser(req);
  if (!verified) return res.status(401).json({ ok: false, error: 'Sign in first.' });
  if (!isAdminEmail(verified.email)) return res.status(403).json({ ok: false, error: 'This account is not an admin.' });
  const appUrl = appOrigin(req);
  try {
    if (req.method === 'POST') {
      const source = cleanSource(req.body?.question, req.body?.link);
      if (req.body?.question !== undefined && !source) return res.status(400).json({ ok: false, error: 'Paste the question itself (at least a couple of sentences).' });
      const run = await runBlogEpisode({ appUrl, deadline, startNew: req.body?.startNew === true, ...(source ? { source } : {}) });
      return res.status(200).json({ ok: true, run });
    }
    await ensureSchema();
    const rows = await query(`SELECT * FROM blog_episodes ORDER BY id DESC LIMIT 60`);
    const episodes: AdminEpisodeRow[] = rows.map((r: any) => {
      const ep = rowToEpisode(r);
      return {
        id: ep.id,
        week: ep.week,
        status: ep.status,
        title: ep.post?.title || null,
        guest: personaLine(ep.persona),
        step: ep.status === 'drafting' ? describeStep(ep.state) : null,
        kind: ep.state.source ? 'question' : 'guest',
        lastError: r.last_error || null,
        createdAt: ep.createdAt,
        publishedAt: ep.publishedAt,
        url: ep.status === 'published' && ep.slug ? `${appUrl}/blog/${ep.slug}` : null,
        reviewUrl: ep.post ? reviewLink(appUrl, ep.id) : null,
      };
    });
    return res.status(200).json({
      ok: true,
      episodes,
      setup: { ai: Boolean(process.env.GEMINI_API_KEY), reviewLinks: Boolean(process.env.NOTIFY_LINK_SECRET?.trim()) },
    });
  } catch (err: any) {
    console.error('Blog admin error:', err?.message || err);
    return res.status(503).json({ ok: false, error: 'The blog is not available right now.' });
  }
}
