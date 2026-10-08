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
 * "T-minus Talks": a weekly conversation for the blog (/blog).
 *
 * Every week a fictional guest (server/blogPersonas.ts) uses the REAL app:
 * types a request, answers the app's own follow-up questions and gets the
 * plan the real planner makes. Then two AI agents talk about it - Tess, the
 * host, who only knows what a host would (the guest's intro, what they
 * asked, the plan), and the guest, who knows their own life - one turn per
 * call, each with its own brief. An editor pass turns the transcript into a
 * post. Because the plan is real, nobody can make up what the app did.
 *
 * Nothing is published by itself: the owner gets the draft by email and
 * Telegram with a review link (Publish / Skip). Every post says its guest
 * is an AI persona, so it can't read as a customer testimonial.
 *
 * The work is split into steps, saved after each one, because a cron run
 * has 60 seconds: the daily cron advances this week's episode as far as
 * its time allows, and the next day's run carries on (usually done in 1-3
 * days). Manual run: /api/cron/blog-episode (see docs/owner-todo.md).
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
}

export interface BlogPost {
  title: string;
  description: string;
  intro: string;
  sections: Array<{ heading: string; lines: Turn[] }>;
  takeaways: string[];
  /** The guest's criticism, for the owner only - never on the page. */
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

/** The host's agenda, one line per question; the last one closes. */
export const AGENDA = [
  'Welcome the guest by first name, say in one sentence who they are (from the intro card), and ask what is coming up and why it is on their mind.',
  'Ask what usually goes wrong for them with something like this, or what went wrong last time.',
  'Ask about how they described it to the app and what it asked back (you can see both below).',
  'Pick one step of the plan - the first one, or one with a surprising lead time - and ask about it.',
  'Ask honestly what felt off, unnecessary or missing in the plan for someone in their situation.',
  'Ask how the steps fit into their week and their calendar, and how they hear about them.',
  'Ask for one tip for readers in a similar situation.',
  'Close the conversation: thank them in a sentence or two and sum up the one idea readers should take away. No question.',
];
/** host, guest, host, guest ... host (closing). */
export const TRANSCRIPT_LENGTH = AGENDA.length * 2 - 1;

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
const STEP_MS = { request: 20_000, clarify: 16_000, answers: 20_000, plan: 40_000, share: 3_000, turn: 20_000, edit: 30_000 };

const when = (p: Persona, now: Date) => datePhrase(p.scenario.weeksOut, p.scenario.nights, now);

function guestBrief(p: Persona, now: Date): string {
  return `You are ${p.name}, ${p.age}, ${p.role}, living in ${p.city} (${p.householdDetail}). This is a fictional persona for a blog conversation; speak as this person, in the first person.
Coming up: ${p.scenario.event}, ${when(p, now)}.
How you plan: ${p.planningStyle}. Your complication: ${p.constraint}. Your manner: ${p.temperament}.
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

const RULES_GUEST = `Answer the host's last question in 40-110 words, natural spoken English, with concrete details from your life (invented, but consistent with your brief and what you said before). Be honest about the plan: if a step is unnecessary, too early, too late or something is missing for someone like you, say so - plainly, without drama. No generic praise, no marketing words, no lists. ${APP_FACTS}`;

const RULES_HOST = `You are ${HOST.name}, ${HOST.bio}. Ahead Of Time is a free app that plans the preparation for an event backwards from its date and puts the steps in your calendar. Your guest is a fictional AI persona who just used the app for a situation in their life; you both know that, no need to mention it. Style: warm, curious, a little dry, concrete. One question at a time, at most 60 words. Build on what the guest just said; quote the plan when it helps. Never answer for the guest. ${APP_FACTS}`;

/**
 * Advances an episode by as many steps as this run's time allows.
 * Returns the post once the editor has written it.
 */
export async function advanceEpisode(persona: Persona, state: EpisodeState, episodeKey: string, deps: EpisodeDeps): Promise<{ state: EpisodeState; post: BlogPost | null }> {
  const s: EpisodeState = { ...state, transcript: [...(state.transcript || [])] };
  const fits = (ms: number) => deps.timeLeft() >= ms;

  // 1. The guest's request, as they'd type it.
  if (!s.request) {
    if (!fits(STEP_MS.request)) return { state: s, post: null };
    const date = when(persona, deps.now);
    const text = await deps.llm({
      system: guestBrief(persona, deps.now),
      prompt: `You're opening a planning app's chat box to get ready for what's coming up. Write exactly what you type: one or two sentences, how you'd really type it (casual, no greeting). Include the date written exactly as "${date}". Mention one detail of your situation that matters for the planning.`,
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
  while (s.transcript.length < TRANSCRIPT_LENGTH) {
    if (!fits(STEP_MS.turn)) return { state: s, post: null };
    const hostTurn = s.transcript.length % 2 === 0;
    const material = `${appExchange(s)}\n\nThe plan the app made:\n${planText(s.plan)}\n\nThe conversation so far:\n${transcriptText(persona, s.transcript)}`;
    const text = hostTurn
      ? await deps.llm({ system: RULES_HOST, prompt: `${intro}\n\n${material}\n\nYour next line: ${AGENDA[s.transcript.length / 2]}` })
      : await deps.llm({ system: `${guestBrief(persona, deps.now)}\n\n${RULES_GUEST}`, prompt: `${material}\n\nYour answer to ${HOST.name}'s last question:` });
    const line = cleanTurn(text, persona);
    if (!line) throw new Error('An empty turn came back.');
    s.transcript.push({ speaker: hostTurn ? 'host' : 'guest', text: line });
    await deps.save(s);
  }

  // 5. The editor: transcript -> post.
  if (!fits(STEP_MS.edit)) return { state: s, post: null };
  const raw = await deps.llm({
    system: `You edit "${SERIES}", the interview series on the Ahead Of Time blog, for readers who might plan the same kind of event. Keep both voices; cut filler, repetition and small talk; you may shorten and merge lines, but never add a claim, number or feature that isn't in the transcript or plan. Keep at least one of the guest's critical remarks. British-neutral plain English.`,
    prompt: `Guest: ${personaLine(persona)} (${persona.householdDetail}). Host: ${HOST.name}.
Coming up for the guest: ${persona.scenario.event}.

${appExchange(s)}

The plan:
${planText(s.plan)}

Transcript:
${transcriptText(persona, s.transcript)}

Write:
- title: max 80 characters, specific and human, e.g. "A night-shift nurse plans her sister's hen weekend in Lisbon" (no clickbait, no colon-subtitle)
- description: max 155 characters, for search results
- intro: 2-3 sentences setting the scene (who, what's coming up, what makes it tricky)
- sections: 3-5, each a short heading (max 6 words) and the edited lines in order, speaker "host" or "guest"
- takeaways: exactly 3 short, practical lessons for readers (lead times, what to start first), from the conversation and plan
- productNotes: the guest's criticism of the app or the plan, as short notes for the product team (empty if none)`,
    schema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        intro: { type: Type.STRING },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING },
              lines: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { speaker: { type: Type.STRING }, text: { type: Type.STRING } }, required: ['speaker', 'text'] } },
            },
            required: ['heading', 'lines'],
          },
        },
        takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
        productNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['title', 'description', 'intro', 'sections', 'takeaways', 'productNotes'],
    },
    timeoutMs: 25_000,
  });
  const post = sanitizePost(JSON.parse(raw));
  if (!post) throw new Error('The editor returned an unusable post.');
  return { state: s, post };
}

const cap = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Only well-formed, bounded fields; null when there's not enough to publish. */
export function sanitizePost(d: any): BlogPost | null {
  if (!d || typeof d !== 'object') return null;
  const sections = (Array.isArray(d.sections) ? d.sections : [])
    .map((sec: any) => ({
      heading: cap(sec?.heading, 80),
      lines: (Array.isArray(sec?.lines) ? sec.lines : [])
        .map((l: any) => ({ speaker: l?.speaker === 'host' ? 'host' : l?.speaker === 'guest' ? 'guest' : null, text: cap(l?.text, 1500) }))
        .filter((l: any) => l.speaker && l.text) as Turn[],
    }))
    .filter((sec: any) => sec.heading && sec.lines.length)
    .slice(0, 6);
  const post: BlogPost = {
    title: cap(d.title, 100),
    description: cap(d.description, 170),
    intro: cap(d.intro, 800),
    sections,
    takeaways: (Array.isArray(d.takeaways) ? d.takeaways : []).map((t: unknown) => cap(t, 240)).filter(Boolean).slice(0, 5),
    productNotes: (Array.isArray(d.productNotes) ? d.productNotes : []).map((t: unknown) => cap(t, 300)).filter(Boolean).slice(0, 8),
  };
  const lines = sections.reduce((n: number, sec: { lines: Turn[] }) => n + sec.lines.length, 0);
  return post.title && post.intro && lines >= 6 && post.takeaways.length ? post : null;
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
export async function runBlogEpisode(opts: { appUrl: string; deadline: number; startNew?: boolean; now?: Date; /** Tests: stand-ins for the AI calls. */ deps?: Partial<EpisodeDeps> }): Promise<{ status: string; week?: string; reviewUrl?: string; step?: string }> {
  if (!process.env.GEMINI_API_KEY && !opts.deps?.llm) return { status: 'skipped: no AI key (a conversation without the real planner is not worth posting)' };
  await ensureSchema();
  const now = opts.now || new Date();
  let row = (await query(`SELECT * FROM blog_episodes WHERE status = 'drafting' ORDER BY id DESC LIMIT 1`))[0];
  if (!row) {
    const { weekLabel } = exampleForWeek(now);
    const thisWeek = await query<{ week: string }>(`SELECT week FROM blog_episodes WHERE week = $1 OR week LIKE $2`, [weekLabel, `${weekLabel}-%`]);
    if (thisWeek.length && !opts.startNew) return { status: 'this week is done', week: weekLabel };
    const recent = await query<{ persona: Persona }>(`SELECT persona FROM blog_episodes ORDER BY id DESC LIMIT 8`);
    const persona = drawPersona(recent.map((r) => recentGuestOf(r.persona)));
    const week = thisWeek.length ? `${weekLabel}-${thisWeek.length + 1}` : weekLabel;
    row = (await query(`INSERT INTO blog_episodes (week, persona) VALUES ($1, $2::jsonb) RETURNING *`, [week, JSON.stringify(persona)]))[0];
  }
  const ep = rowToEpisode(row);
  const save = (s: EpisodeState) => query(`UPDATE blog_episodes SET state = $2::jsonb, updated_at = now() WHERE id = $1`, [ep.id, JSON.stringify(s)]).then(() => undefined);
  try {
    const { state, post } = await advanceEpisode(ep.persona, ep.state, ep.week, { ...liveDeps(opts.deadline, save, now), ...opts.deps });
    if (!post) return { status: 'drafting', week: ep.week, step: describeStep(state) };
    await query(`UPDATE blog_episodes SET post = $2::jsonb, status = 'review', updated_at = now() WHERE id = $1`, [ep.id, JSON.stringify(post)]);
    const reviewUrl = reviewLink(opts.appUrl, ep.id);
    await deliverForReview({ ...ep, state, post, status: 'review' }, opts.appUrl);
    await query(`UPDATE blog_episodes SET delivered_at = now() WHERE id = $1`, [ep.id]);
    return { status: 'ready for review', week: ep.week, reviewUrl: reviewUrl || undefined };
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 300);
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
  if (!s.request) return 'writing the request';
  if (!s.answers) return 'answering the app';
  if (!s.plan || !s.shareToken) return 'planning';
  if (s.transcript.length < TRANSCRIPT_LENGTH) return `talking (${s.transcript.length}/${TRANSCRIPT_LENGTH} turns)`;
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
  const notes = post.productNotes.length ? post.productNotes : ['(no criticism this week)'];
  const ownerEmail = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAILS || '').split(',')[0].trim();
  let emailed = false;
  if (ownerEmail && isEmailConfigured()) {
    const text = [
      `${SERIES} ${ep.week} is ready to review.`,
      `"${post.title}"`,
      `Guest: ${personaLine(ep.persona)} (AI persona)`,
      '',
      post.intro,
      '',
      'Product notes from the guest (not published):',
      ...notes.map((n) => `- ${n}`),
      '',
      link ? `Read it, add a note of your own if you like, then publish or skip: ${link}` : 'NOTIFY_LINK_SECRET is not set, so there is no review link.',
      'Nothing is published until you tap Publish.',
    ].join('\n');
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#182A42">
<p style="font-weight:900;color:#447463;margin:0 0 4px">${esc(SERIES)} · ${esc(ep.week)}</p>
<h1 style="font-size:20px;margin:0 0 6px">${esc(post.title)}</h1>
<p style="color:#475569;font-size:14px;margin:0 0 12px">Guest: ${esc(personaLine(ep.persona))} (AI persona)</p>
<p style="font-size:14px;line-height:1.55;margin:0 0 16px">${esc(post.intro)}</p>
<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin:0 0 16px"><p style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 6px">Product notes from the guest (not published)</p><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#182A42;color:#fff;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none">Read it, add your note, then publish or skip</a></p>` : '<p>NOTIFY_LINK_SECRET is not set, so there is no review link.</p>'}
<p style="color:#94a3b8;font-size:12px">Nothing is published until you tap Publish.</p></div>`;
    const sent = await sendEmail({ to: ownerEmail, subject: `${SERIES}: ${post.title}`, html, text }).catch(() => ({ ok: false }));
    emailed = sent.ok;
  }
  await notifyOwnerTelegram(
    [`📝 ${SERIES} ${ep.week} is ready to review`, `"${post.title}"`, `Guest: ${personaLine(ep.persona)}`, link ? `Review: ${link}` : '', emailed ? 'Product notes are in your email.' : `Product notes:\n${notes.map((n) => `- ${n}`).join('\n')}`]
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

function personaCard(p: Persona): string {
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
  const body = `${bar}<main class="post"><p class="kicker">${SERIES} · ${esc(date)}</p><h1>${esc(post.title)}</h1>
${ep.reviewer ? `<p class="byline">Reviewed by <b>${esc(ep.reviewer.name)}</b>${ep.reviewer.bio ? `, ${esc(ep.reviewer.bio)}` : ''}</p>` : ''}
<p class="intro">${esc(post.intro)}</p>${personaCard(p)}
${post.sections
  .map(
    (sec) => `<section class="talk"><h2>${esc(sec.heading)}</h2>${sec.lines
      .map((l) => `<p class="line ${l.speaker}"><span class="who">${esc(name(l))}</span>${esc(l.text)}</p>`)
      .join('')}</section>`
  )
  .join('\n')}
${ep.state.plan ? planBox(ep.state.plan, shareLink) : ''}
${ep.ownerNote ? `<section class="owner-note"><p class="label">A note from ${esc(ep.reviewer?.name || 'the team')}</p>${ep.ownerNote.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('')}</section>` : ''}
<section class="takeaways"><h2>Takeaways</h2><ul>${post.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<section class="try"><h2>Plan your own</h2><p>Tell it what's coming up and get the steps, backwards from the date. Free, no sign-up needed to try.</p><a class="btn" href="/try">Try it with your own event</a></section>
<p class="disclosure">${esc(DISCLOSURE)}</p></main>`;
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
  const notes = ep.post?.productNotes.length ? `<details><summary>Product notes from the guest (never published)</summary><ul>${ep.post.productNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';
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
<div class="actions">${actions}</div></form>${notes}</div>`;
}

export function renderIndexPage(posts: Episode[], appUrl: string): string {
  const list = posts.length
    ? `<ul class="list">${posts
        .map(
          (ep) => `<li><a href="/blog/${esc(ep.slug || '')}"><span class="date">${esc(longDate(ep.publishedAt || ep.createdAt))}</span><span class="t">${esc(ep.post!.title)}</span><span class="d">${esc(ep.post!.description)}</span><span class="g">Guest: ${esc(personaLine(ep.persona))}</span></a></li>`
        )
        .join('')}</ul>`
    : `<p class="empty">The first conversation is on its way.</p>`;
  return layout({
    appUrl,
    title: `${SERIES} - the Ahead Of Time blog`,
    description: 'Every week, someone with a busy life plans what is coming up with Ahead Of Time, and talks it through with our host Tess.',
    path: '/blog',
    body: `<main class="index"><p class="kicker">The Ahead Of Time blog</p><h1>${SERIES}</h1>
<p class="intro">Every week a guest with a busy life plans what's coming up with Ahead Of Time, and talks it through with ${HOST.name}: what usually goes wrong, what the plan got right, and what it missed.</p>
${list}<section class="about" id="about"><h2>About our guests</h2><p>${esc(DISCLOSURE)} Each one gets a different job, city, household and calendar, so we see how the app holds up for people who don't plan like we do. The criticism they raise goes straight to our product list.</p></section></main>`,
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

async function setStatus(id: number, action: string, body: any = {}): Promise<Episode | null> {
  const ep = await getEpisode(id);
  if (!ep || !ep.post) return ep;
  if (action === 'save' || action === 'publish') {
    const { note, reviewer } = cleanOwnerInput(body);
    await query(`UPDATE blog_episodes SET owner_note = $2, reviewer = $3::jsonb, updated_at = now() WHERE id = $1`, [id, note, reviewer ? JSON.stringify(reviewer) : null]);
  }
  if (action === 'publish' && ep.status !== 'published') {
    let slug = ep.slug || slugify(ep.post.title);
    for (let n = 2; !ep.slug; n++) {
      const taken = await query(`SELECT 1 FROM blog_episodes WHERE slug = $1 AND id <> $2`, [slug, id]);
      if (!taken.length) break;
      slug = `${slugify(ep.post.title).slice(0, 64)}-${n}`;
    }
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
export async function handleBlogAdmin(req: any, res: any, deadline: number) {
  res.setHeader('Cache-Control', 'no-store');
  const verified = await verifyRequestUser(req);
  if (!verified) return res.status(401).json({ ok: false, error: 'Sign in first.' });
  if (!isAdminEmail(verified.email)) return res.status(403).json({ ok: false, error: 'This account is not an admin.' });
  const appUrl = appOrigin(req);
  try {
    if (req.method === 'POST') {
      const run = await runBlogEpisode({ appUrl, deadline, startNew: req.body?.startNew === true });
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
