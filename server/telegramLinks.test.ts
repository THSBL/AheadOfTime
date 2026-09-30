import { describe, it, expect } from 'vitest';
import { neutralizeForeignLinks } from './telegramService';

describe('neutralizeForeignLinks', () => {
  it('keeps links to our app and Telegram', () => {
    const t = '[Open](https://aheadoftime.app/dashboard) and [bot](https://t.me/AheadTimebot)';
    expect(neutralizeForeignLinks(t, 'Markdown')).toBe(t);
  });
  it('drops the link but keeps the text for other sites', () => {
    expect(neutralizeForeignLinks('Title [Open your plan](https://evil.example/x) end', 'Markdown')).toBe('Title Open your plan end');
    expect(neutralizeForeignLinks('[x](javascript:alert(1))', 'Markdown')).not.toContain('javascript');
  });
  it('handles HTML links', () => {
    expect(neutralizeForeignLinks('<a href="https://evil.example">Sign in</a>', 'HTML')).toBe('Sign in');
    expect(neutralizeForeignLinks('<a href="https://aheadoftime.app/x">Go</a>', 'HTML')).toContain('href');
  });
});
