import { describe, it, expect, vi } from 'vitest';
import { TelegramService } from './telegramService';

describe('Telegram plan message', () => {
  it('shows the milestones, then exactly: Looks Good, Open timeline, Refine in chat', async () => {
    const send = vi.spyOn(TelegramService, 'sendMessage').mockResolvedValue({ ok: true } as any);
    await TelegramService.sendRefinementPrompt(1, {
      id: 'evt1', title: 'Trip to Mallorca', eventDate: '2026-10-23', category: 'travel_trip', status: 'milestones_active',
      milestones: [{ id: 'm1', eventId: 'evt1', title: 'Flights booked', calculatedDate: '2026-09-30', tMinusLabel: 'T-23d', tMinusOffsetMinutes: 0, category: 'booking', status: 'pending' }],
      outstandingGaps: [{ key: 'user_responsibility', question: "Who's responsible?", impact: 'high', requiredBeforePlanning: false, options: ["I'm organizing it"] }],
    } as any, 'https://aheadoftime.app');
    const [, text, opts] = send.mock.calls[0] as any[];
    expect(text).toContain('Flights booked');
    expect(text).not.toContain('Still deciding');
    expect(opts.reply_markup.inline_keyboard.map((row: any[]) => row.map((b) => b.text))).toEqual([
      ['✅ Looks Good'],
      ['🛠️ Open Timeline in App'],
      ['🔄 Refine in Chat'],
    ]);
  });
});
