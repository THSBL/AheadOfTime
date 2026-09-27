import { describe, it, expect, afterEach } from 'vitest';
import { TelegramService } from './telegramService';

describe('Telegram webhook secret', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is always set when the bot is configured: derived from the bot token unless configured', () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = '123:abc';
    const derived = TelegramService.getWebhookSecret();
    expect(derived).toMatch(/^[a-f0-9]{48}$/);
    expect(TelegramService.getWebhookSecret()).toBe(derived);
    process.env.TELEGRAM_BOT_TOKEN = '123:other';
    expect(TelegramService.getWebhookSecret()).not.toBe(derived);
    process.env.TELEGRAM_WEBHOOK_SECRET = 'configured_secret';
    expect(TelegramService.getWebhookSecret()).toBe('configured_secret');
  });

  it('has no secret (and the webhook refuses everything) without a bot token', () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(TelegramService.getWebhookSecret()).toBeNull();
  });

  it('always registers our own URL', () => {
    process.env.APP_URL = 'https://aheadoftime.app/';
    expect(TelegramService.ownWebhookUrl('evil.example')).toBe('https://aheadoftime.app/api/telegram/webhook');
  });
});
