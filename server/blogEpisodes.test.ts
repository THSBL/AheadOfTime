import { describe, it, expect, beforeEach } from 'vitest';
import {
  advanceEpisode,
  cleanTurn,
  renderPostPage,
  renderIndexPage,
  sanitizePost,
  signReviewToken,
  slugify,
  verifyReviewToken,
  TRANSCRIPT_LENGTH,
  type EpisodeDeps,
  type EpisodeState,
  type Episode,
} from './blogEpisodes';
import { drawPersona, SCENARIOS, recentGuestOf, type Persona } from './blogPersonas';

const NOW = new Date('2026-10-05T07:00:00Z');

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const persona: Persona = {
  name: 'Priya',
  age: 34,
  role: 'ICU nurse on rotating shifts',
  city: 'Rotterdam',
  household: 'couple',
  householdDetail: 'lives with a partner',
  calendar: 'Outlook',
  updates: 'Telegram',
  planningStyle: 'last-minute by nature, then panics',
  constraint: 'shift work that changes every week',
  temperament: 'dry humour, a bit sceptical of apps',
  scenario: SCENARIOS.find((s) => s.key === 'hen-weekend')!,
};

const plan = {
  title: 'Hen weekend in Lisbon',
  eventDate: '2026-11-14',
  endDate: '2026-11-16',
  steps: [
    { title: 'Explore & share: stay options (neighbourhood, price, rooms)', date: '2026-10-10', ideas: ['Alfama apartment for 10'], done: false },
    { title: 'Decide & book: where to stay', date: '2026-10-17', ideas: [], done: false },
    { title: 'Collect money from the group', date: '2026-10-24', ideas: ['Tikkie per person'], done: false },
  ],
};

function fakeDeps(overrides: Partial<EpisodeDeps> = {}, log: string[] = []): EpisodeDeps {
  return {
    now: NOW,
    llm: async (req) => {
      if (req.schema?.properties?.answers) {
        log.push('answers');
        return JSON.stringify({ answers: [{ index: 0, answer: 'Flying' }] });
      }
      if (req.schema?.properties?.title) {
        log.push('edit');
        return JSON.stringify({
          title: 'A night-shift nurse plans her sister\'s hen weekend <in Lisbon>',
          description: 'Ten friends, one group chat, rotating shifts.',
          intro: 'Priya works rotating shifts and the group chat decides nothing.',
          sections: [
            { heading: 'What is coming up', lines: [{ speaker: 'host', text: 'Welcome, Priya.' }, { speaker: 'guest', text: 'Thanks.' }, { speaker: 'robot', text: 'x' }] },
            { heading: 'The plan', lines: [{ speaker: 'host', text: 'The first step?' }, { speaker: 'guest', text: 'Shortlisting stays.' }] },
            { heading: 'What missed', lines: [{ speaker: 'host', text: 'Anything off?' }, { speaker: 'guest', text: 'No step for my shifts. <script>alert(1)</script>' }] },
          ],
          takeaways: ['Book the stay six weeks out.', 'Collect money early.', 'Pick one decider.'],
          productNotes: ['Shift workers want steps on days off.'],
        });
      }
      if (/opening a planning app/.test(req.prompt)) {
        log.push('request');
        return 'organising my sister\'s hen do in lisbon, 9 of us, I work shifts';
      }
      const host = /Your next line/.test(req.prompt);
      log.push(host ? 'host' : 'guest');
      return host ? '**Tess:** So, what is coming up?' : 'Priya: "Honestly, chaos."';
    },
    clarify: async () => {
      log.push('clarify');
      return [{ question: 'How are you getting there?', options: ['Flying', 'Train'] }];
    },
    plan: async (message) => {
      log.push(`plan:${message.includes('Details:') ? 'with-answers' : 'bare'}`);
      return plan;
    },
    share: async () => 'tok12345678',
    timeLeft: () => 60_000,
    save: async () => {},
    ...overrides,
  };
}

describe('advanceEpisode (one conversation, step by step)', () => {
  it('runs the guest through the real app flow, then talks turn by turn, then edits', async () => {
    const log: string[] = [];
    const { state, post } = await advanceEpisode(persona, { transcript: [] }, '2026-W41', fakeDeps({}, log));
    expect(log.slice(0, 4)).toEqual(['request', 'clarify', 'answers', 'plan:with-answers']);
    // The request carries the exact date even when the guest left it out.
    expect(state.request).toMatch(/from 21 November to 23 November 2026/);
    expect(state.answers).toEqual([{ question: 'How are you getting there?', answer: 'Flying' }]);
    expect(state.transcript).toHaveLength(TRANSCRIPT_LENGTH);
    expect(state.transcript.map((t) => t.speaker).slice(0, 3)).toEqual(['host', 'guest', 'host']);
    expect(state.transcript.at(-1)!.speaker).toBe('host');
    // Labels and wrapping quotes are stripped.
    expect(state.transcript[0].text).toBe('So, what is coming up?');
    expect(state.transcript[1].text).toBe('Honestly, chaos.');
    expect(post!.sections[0].lines.map((l) => l.speaker)).toEqual(['host', 'guest']);
    expect(post!.productNotes).toEqual(['Shift workers want steps on days off.']);
  });

  it('stops when the run is out of time, and carries on from the saved state', async () => {
    let left = 25_000;
    const saved: EpisodeState[] = [];
    // Each saved step uses up 6 s of the run.
    const deps = fakeDeps({ timeLeft: () => left, save: async (s) => { saved.push(structuredClone(s)); left -= 6_000; } });
    const first = await advanceEpisode(persona, { transcript: [] }, 'w', deps);
    // Enough for the request and the questions, not for answering them too.
    expect(first.post).toBeNull();
    expect(first.state.request).toBeTruthy();
    expect(first.state.questions).toHaveLength(1);
    expect(first.state.answers).toBeUndefined();
    left = 10_000_000;
    const second = await advanceEpisode(persona, saved.at(-1)!, 'w', deps);
    expect(second.post).not.toBeNull();
  });

  it('skips the answers when the app asked nothing', async () => {
    const log: string[] = [];
    const { state } = await advanceEpisode(persona, { transcript: [] }, 'w', fakeDeps({ clarify: async () => [] }, log));
    expect(log).not.toContain('answers');
    expect(state.answers).toEqual([]);
  });
});

describe('sanitizePost', () => {
  it('drops malformed lines and refuses a post that is too thin', () => {
    expect(sanitizePost({ title: 'x', intro: 'y', sections: [], takeaways: ['a'] })).toBeNull();
    expect(sanitizePost(null)).toBeNull();
  });
});

describe('cleanTurn', () => {
  it('removes speaker labels, stage directions and wrapping quotes', () => {
    expect(cleanTurn('Tess: "Welcome!"', persona)).toBe('Welcome!');
    expect(cleanTurn('**Priya:** Well (laughs) yes.', persona)).toBe('Well yes.');
  });
});

describe('pages', () => {
  const ep = (post: any): Episode => ({
    id: 1,
    week: '2026-W41',
    status: 'published',
    persona,
    state: { transcript: [], plan, shareToken: 'tok12345678' },
    post,
    slug: 'a-night-shift-nurse',
    createdAt: NOW.toISOString(),
    publishedAt: NOW.toISOString(),
  });

  it('escapes everything the models wrote and always says the guest is an AI persona', async () => {
    const { post } = await advanceEpisode(persona, { transcript: [] }, 'w', fakeDeps());
    const html = renderPostPage(ep(post), 'https://aheadoftime.app');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('AI persona');
    expect(html).toContain('https://aheadoftime.app/p/tok12345678');
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).not.toContain('Shift workers want'); // product notes stay private
    expect(html).not.toMatch(/<style|style="/);
  });

  it('the review view adds the publish bar and the private notes, and is not indexed', async () => {
    const { post } = await advanceEpisode(persona, { transcript: [] }, 'w', fakeDeps());
    const html = renderPostPage({ ...ep(post), status: 'review' }, 'https://aheadoftime.app', { token: 'k' });
    expect(html).toContain('name="do" value="publish"');
    expect(html).toContain('Shift workers want');
    expect(html).toContain('noindex');
    expect(html).not.toContain('BlogPosting');
  });

  it('lists nothing yet without breaking', () => {
    expect(renderIndexPage([], 'https://aheadoftime.app')).toContain('first conversation is on its way');
  });

  it('makes readable slugs', () => {
    expect(slugify("A night-shift nurse plans her sister's hen weekend in Lisbon")).toBe('a-night-shift-nurse-plans-her-sisters-hen-weekend-in-lisbon');
    expect(slugify('Café & crème: ça va?')).toBe('cafe-creme-ca-va');
    expect(slugify('!!!')).toBe('conversation');
  });
});

describe('review links', () => {
  beforeEach(() => {
    process.env.NOTIFY_LINK_SECRET = 'test-secret';
  });

  it('accepts its own signature only', () => {
    const k = signReviewToken(42)!;
    expect(verifyReviewToken(k)).toBe(42);
    expect(verifyReviewToken(k.replace(/^42\./, '43.'))).toBeNull();
    expect(verifyReviewToken(`${k.slice(0, -1)}${k.endsWith('0') ? '1' : '0'}`)).toBeNull();
    expect(verifyReviewToken('nonsense')).toBeNull();
  });

  it('expires', () => {
    const old = signReviewToken(7, Date.now() - 61 * 86_400_000)!;
    expect(verifyReviewToken(old)).toBeNull();
  });
});

describe('drawPersona', () => {
  it('keeps guests believable: kids-only scenarios get a family, work scenarios a matching job', () => {
    const rng = seeded(7);
    for (let i = 0; i < 300; i++) {
      const p = drawPersona([], rng);
      if (p.scenario.households) expect(p.scenario.households).toContain(p.household);
      if (p.scenario.roles) expect(p.scenario.roles).toContain(p.role);
      if (p.household === 'family_with_kids') expect(p.householdDetail).toMatch(/kid/);
    }
  });

  it("doesn't repeat recent scenarios, roles, cities or names", () => {
    const rng = seeded(3);
    const recent = [] as ReturnType<typeof recentGuestOf>[];
    for (let i = 0; i < 6; i++) {
      const p = drawPersona(recent, rng);
      for (const r of recent) {
        expect(p.scenario.key).not.toBe(r.scenarioKey);
        expect(p.city).not.toBe(r.city);
        expect(p.name).not.toBe(r.name);
      }
      recent.unshift(recentGuestOf(p));
    }
  });
});
