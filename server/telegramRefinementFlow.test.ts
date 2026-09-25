import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: { pending: any; sent: any[]; callbacks: string[]; plannedWith: any[] } = { pending: undefined, sent: [], callbacks: [], plannedWith: [] };

vi.mock('./telegramStore.js', () => ({
  TelegramSessionStore: {
    getOrCreateSession: vi.fn(async () => ({ chatId: 1, isLinked: true, webUserId: 'u1' })),
    getPendingRefinement: vi.fn(async () => state.pending),
    setPendingRefinement: vi.fn(async (_c: any, p: any) => { state.pending = p || undefined; }),
    getPendingRefinementClarification: vi.fn(async () => undefined),
    setPendingRefinementClarification: vi.fn(async () => {}),
    getPendingEventNote: vi.fn(async () => undefined),
    setPendingEventNote: vi.fn(async () => {}),
    getPendingClarification: vi.fn(async () => undefined),
  },
}));
vi.mock('./telegramService.js', () => ({
  TelegramService: {
    sendMessage: vi.fn(async (_c: any, text: string, opts: any) => { state.sent.push({ text, opts }); return { ok: true }; }),
    answerCallbackQuery: vi.fn(async (_id: string, text: string) => { state.callbacks.push(text); }),
    sendChatAction: vi.fn(async () => {}),
    sendRefinementPrompt: vi.fn(async (_c: any, event: any) => { state.sent.push({ plan: event.title }); return { ok: true }; }),
  },
  buildEventDeepLink: vi.fn(() => 'https://aheadoftime.app/x'),
}));
vi.mock('./agentProcessor.js', () => ({
  askRefinementQuestions: vi.fn(async ({ message }: { message: string }) =>
    /what's on/i.test(message)
      ? { needsClarification: false, questions: [], isNewEventPlan: false }
      : {
          needsClarification: true,
          isNewEventPlan: true,
          questions: [
            { id: 'when', question: 'When do you go, and when are you back?', options: [], source: 'message', kind: 'dateRange' },
            { id: 'travel_documents', question: 'Travel documents: anything to arrange?', options: ['Visa needed', 'All sorted / not needed'], source: 'message' },
          ],
        }
  ),
}));
vi.mock('./geminiCalendarAgent.js', () => ({
  GeminiCalendarAgent: {
    processMessage: vi.fn(async (_c: any, text: string, _tz: any, options: any) => {
      state.plannedWith.push({ text, options });
      return /what's on/i.test(text) ? { replyText: 'Nothing tomorrow.' } : { replyText: '', createdEvent: { id: 'evt1', title: 'Trip to Mallorca', milestones: [] } };
    }),
  },
}));
vi.mock('./googleBackgroundPush.js', () => ({ pushEventToGoogleInBackground: vi.fn(), isAutoPushEnabledForUser: vi.fn(async () => false) }));
vi.mock('./qualityStore.js', () => ({ logQualityEvent: vi.fn(async () => {}), checkAndLogRapidCorrection: vi.fn() }));

import { TelegramWebhookHandler } from './telegramWebhookHandler';
const H = TelegramWebhookHandler as any;
const say = (text: string) => H.handleIncomingMessage({ chat: { id: 1 }, text, from: { id: 1 } }, 'https://aheadoftime.app');
const tap = (data: string) => H.handleCallbackQuery({ id: 'cb', data, message: { chat: { id: 1 } } }, 'https://aheadoftime.app');

describe('Telegram: questions first, then one plan (same order as the web chat)', () => {
  beforeEach(() => { state.pending = undefined; state.sent = []; state.callbacks = []; state.plannedWith = []; });

  it('asks the questions one at a time before planning anything', async () => {
    await say('Trip to mallorca');
    expect(state.plannedWith).toHaveLength(0);
    expect(state.sent[0].text).toContain('1/2');
    expect(state.sent[0].text).toContain('When do you go');
    expect(state.sent[0].opts.reply_markup.inline_keyboard.at(-1)[0]).toEqual({ text: 'Skip', callback_data: 'RQ:0:s' });

    await say('23 to 29 October');                 // typed answer to Q1
    expect(state.sent[1].text).toContain('2/2');
    expect(state.sent[1].opts.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Visa needed', callback_data: 'RQ:1:0' });

    await tap('RQ:1:0');                            // tapped answer to Q2
    expect(state.pending).toBeUndefined();
    expect(state.plannedWith).toHaveLength(1);
    expect(state.plannedWith[0].options).toEqual({ forceNewEvent: true });
    expect(state.plannedWith[0].text).toBe(
      'Trip to mallorca\n\nDetails:\n- When do you go, and when are you back? 23 to 29 October\n- Travel documents: anything to arrange? Visa needed'
    );
    expect(state.sent.at(-1)).toEqual({ plan: 'Trip to Mallorca' });
  });

  it('skip leaves the answer out, and a tap on an old question is ignored', async () => {
    await say('Trip to mallorca');
    await tap('RQ:0:s');
    await tap('RQ:0:s');                            // stale: question 0 already answered
    expect(state.callbacks).toEqual(['Skipped', 'That question was already answered.']);
    await tap('RQ:1:1');
    expect(state.plannedWith[0].text).toBe('Trip to mallorca\n\nDetails:\n- Travel documents: anything to arrange? All sorted / not needed');
  });

  it('a schedule question skips the questions entirely', async () => {
    await say("What's on tomorrow?");
    expect(state.pending).toBeUndefined();
    expect(state.plannedWith).toEqual([{ text: "What's on tomorrow?", options: { forceNewEvent: undefined } }]);
  });
});
