import type { ContextProvenance, PlanningContextEntry } from '../types';

// Same FNV-1a convention as eventSyncMerge.ts's hashEvent - small,
// non-cryptographic, only used to detect "did the facts that matter
// change", never for security.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

// A "locked" fact came from the user themselves - either something they
// stated directly, or an explicit decision/decline. Either can only ever
// be updated by another user_stated/user_decision entry for the same key,
// never silently overwritten by the AI's own inference.
const LOCKED_PROVENANCE: ContextProvenance[] = ['user_stated', 'user_decision'];

/**
 * Merges a new batch of planning-context entries onto the existing bag.
 * A locked (user_stated/user_decision) entry is never silently overwritten
 * by an ai_inferred/ai_generated entry for the same key - this is the
 * guardrail that keeps a model's own re-reading of the conversation from
 * quietly undoing an explicit user fact or decision. A fresh user entry
 * always wins, since that's a genuine correction.
 */
export function mergePlanningContext(
  existing: Record<string, PlanningContextEntry> | undefined,
  incoming: Record<string, PlanningContextEntry> | undefined,
  now: string = new Date().toISOString()
): Record<string, PlanningContextEntry> {
  const merged: Record<string, PlanningContextEntry> = { ...(existing || {}) };
  if (!incoming) return merged;
  for (const key of Object.keys(incoming)) {
    const incomingEntry = incoming[key];
    const existingEntry = merged[key];
    const existingIsLocked = Boolean(existingEntry && LOCKED_PROVENANCE.includes(existingEntry.provenance));
    const incomingIsLocked = LOCKED_PROVENANCE.includes(incomingEntry.provenance);
    if (existingIsLocked && !incomingIsLocked) continue;
    merged[key] = { ...incomingEntry, updatedAt: incomingEntry.updatedAt || now };
  }
  return merged;
}

/**
 * planning_context_version - a hash over ONLY the user_stated/user_decision
 * subset of the fact bag. Gemini's own ai_inferred/ai_generated prose
 * varies turn to turn without any new user fact having appeared; hashing
 * only the locked subset means that variation never falsely invalidates a
 * cached/hidden tier's content (Phase 4/6), while a genuine new user fact
 * or decision does bump the version and correctly triggers a scoped replan.
 */
export function computePlanningContextVersion(
  context: Record<string, PlanningContextEntry> | undefined
): string {
  if (!context) return '';
  const lockedKeys = Object.keys(context)
    .filter((k) => LOCKED_PROVENANCE.includes(context[k].provenance))
    .sort();
  if (lockedKeys.length === 0) return '';
  const locked: Record<string, unknown> = {};
  for (const key of lockedKeys) locked[key] = context[key].value;
  return fnv1a(stableStringify(locked));
}

/**
 * Extracts just the user_decision entries as a plain value map, for
 * injection into the prompt as hard "LOCKED FACTS" constraints
 * (server/planningPipeline.ts's buildLockedFactsBlock). Deliberately
 * user_decision only, not the broader user_stated set - a decision (e.g.
 * "no cake needed") is a constraint the plan must honor; an incidental
 * stated detail (e.g. a destination mentioned in passing) is context, not
 * a rule the model must be told never to contradict.
 */
export function extractLockedFacts(
  context: Record<string, PlanningContextEntry> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!context) return out;
  for (const key of Object.keys(context)) {
    if (context[key].provenance === 'user_decision') out[key] = context[key].value;
  }
  return out;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// Narrow, first-pass regex detection of an explicit decline in free text -
// the concrete case the plan calls out ("no cake needed", "skip the
// invitations", "we're not doing a gift"). Deliberately scoped, same as
// Phase 3's role-inference heuristics: treat these patterns as tunable
// against real historical messages, not a claim of exhaustive coverage.
const DECLINE_PATTERNS: RegExp[] = [
  /\bno\s+([a-z][a-z\s]{1,30}?)\s+(?:needed|required|necessary)\b/gi,
  /\bskip(?:ping)?\s+(?:the|a|an)?\s*([a-z][a-z\s]{1,30}?)(?:[.,!]|$)/gi,
  /\b(?:not|isn't|won't be)\s+doing\s+(?:a|an|the)?\s*([a-z][a-z\s]{1,30}?)(?:[.,!]|$)/gi,
  /\bdon'?t\s+need\s+(?:a|an|the)?\s*([a-z][a-z\s]{1,30}?)(?:[.,!]|$)/gi,
];

export interface DeclineFact {
  key: string;
  term: string;
}

type MilestoneLike = { title: string; description?: string; status?: string };

export interface LockedFactViolationCheck<M> {
  kept: M[];
  violating: M[];
}

/**
 * Architecture reset Phase 9 - the filtering core shared by both engines'
 * repairLockedFactViolations (server/agentProcessor.ts,
 * server/geminiCalendarAgent.ts). Previously each channel carried its own
 * copy-pasted version of this exact filter; only the surrounding
 * logQualityEvent call (which sourceChannel, whether an eventId is
 * available) is genuinely channel-specific, so that part stays local to
 * each file while the actual matching logic lives here once. Never strips
 * a `completed` milestone - a decline stated after the user already
 * finished that task doesn't undo it, same rule preserveCompletedMilestones
 * applies elsewhere.
 */
export function findLockedFactViolations<M extends MilestoneLike>(
  milestones: M[],
  lockedFacts: Record<string, unknown>
): LockedFactViolationCheck<M> {
  const declineTerms = Object.keys(lockedFacts)
    .filter((k) => k.startsWith('decline_'))
    .map((k) => k.slice('decline_'.length).replace(/_/g, ' ').trim())
    .filter((term) => term.length >= 3);
  if (declineTerms.length === 0) return { kept: milestones, violating: [] };

  const violating: M[] = [];
  const kept = milestones.filter((m) => {
    if (m.status === 'completed') return true;
    const haystack = `${m.title} ${m.description || ''}`.toLowerCase();
    const hit = declineTerms.some((term) => haystack.includes(term));
    if (hit) violating.push(m);
    return !hit;
  });
  return { kept, violating };
}

/**
 * Scans raw user text for an explicit decline and returns the planning-
 * context keys/terms it implies. Each is registered under a stable
 * `decline_<slug>` key so a later turn's identical decline reuses the same
 * key (an update, not a duplicate), and so buildLockedFactsBlock and the
 * post-generation repair check (agentProcessor.ts) can recognize them by
 * their key prefix without re-parsing text.
 */
export function detectDeclineFacts(text: string): DeclineFact[] {
  const found = new Map<string, string>();
  for (const pattern of DECLINE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const term = match[1]?.trim();
      if (!term || term.length < 2) continue;
      const slug = slugify(term);
      if (!slug) continue;
      found.set(`decline_${slug}`, term);
    }
  }
  return Array.from(found.entries()).map(([key, term]) => ({ key, term }));
}
