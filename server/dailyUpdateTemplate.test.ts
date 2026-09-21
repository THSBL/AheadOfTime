import { describe, it, expect } from 'vitest';
import {
  renderTelegramUpdate,
  renderEmailUpdate,
  updateSubject,
  hasUpdateContent,
  lateLabel,
  dueLabel,
  type DailyUpdateModel,
} from './dailyUpdateTemplate';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-0${(i % 9) + 1}`, title: `Step ${i + 1}` }));

function model(overrides: Partial<DailyUpdateModel> = {}): DailyUpdateModel {
  return {
    today: '2026-09-21',
    overdue: [{ title: 'Send invites', eventTitle: "Maya's <party>", dueDate: '2026-09-18' }],
    dueThisWeek: [
      { title: 'Order cake', eventTitle: "Maya's <party>", dueDate: '2026-09-22' },
      { title: 'Buy drinks', eventTitle: "Maya's <party>", dueDate: '2026-09-25' },
    ],
    newEvents: [{ title: 'Amsterdam & friends', eventDate: '2026-10-12', steps: steps(10) }],
    appUrl: 'https://aheadoftime.app',
    ...overrides,
  };
}

describe('labels', () => {
  it('describes lateness and due dates in plain words', () => {
    expect(lateLabel('2026-09-21', '2026-09-20')).toBe('1 day late');
    expect(lateLabel('2026-09-21', '2026-09-18')).toBe('3 days late');
    expect(dueLabel('2026-09-21', '2026-09-21')).toBe('today');
    expect(dueLabel('2026-09-21', '2026-09-22')).toBe('tomorrow');
    expect(dueLabel('2026-09-21', '2026-09-25')).toBe('Fri');
  });
});

describe('updateSubject / hasUpdateContent', () => {
  it('summarises only the non-empty parts', () => {
    expect(updateSubject(model())).toBe('Your daily update: 1 overdue, 2 due this week, 1 new event');
    expect(updateSubject(model({ overdue: [], newEvents: [] }))).toBe('Your daily update: 2 due this week');
    expect(updateSubject(model({ overdue: [], dueThisWeek: [], newEvents: [] }))).toBe('Your daily update');
  });

  it('knows when there is nothing to say', () => {
    expect(hasUpdateContent(model())).toBe(true);
    expect(hasUpdateContent(model({ overdue: [], dueThisWeek: [], newEvents: [] }))).toBe(false);
  });
});

describe('renderTelegramUpdate', () => {
  it('orders sections attention -> this week -> new events and shows labels', () => {
    const { text } = renderTelegramUpdate(model());
    expect(text.indexOf('Needs attention (1)')).toBeLessThan(text.indexOf('This week (2)'));
    expect(text.indexOf('This week (2)')).toBeLessThan(text.indexOf('New on your calendar (1)'));
    expect(text).toContain('3 days late');
    expect(text).toContain('tomorrow');
    expect(text).toContain('10 prep steps');
  });

  it('escapes HTML in user-supplied titles and uses HTML parse mode', () => {
    const out = renderTelegramUpdate(model());
    expect(out.parse_mode).toBe('HTML');
    expect(out.text).toContain('Maya&#039;s'.replace('&#039;', "'")); // apostrophes are fine in HTML mode
    expect(out.text).toContain('&lt;party&gt;');
    expect(out.text).not.toContain('<party>');
    expect(out.text).toContain('Amsterdam &amp; friends');
  });

  it('shows only the first two prep steps per event to stay compact', () => {
    const { text } = renderTelegramUpdate(model());
    expect(text).toContain('Step 1');
    expect(text).toContain('Step 2');
    expect(text).not.toContain('Step 3');
  });

  it('omits sections that are empty', () => {
    const { text } = renderTelegramUpdate(model({ overdue: [], newEvents: [] }));
    expect(text).not.toContain('Needs attention');
    expect(text).not.toContain('New on your calendar');
    expect(text).toContain('This week (2)');
  });

  it('caps long lists with an "and N more" line and stays under Telegram\'s size limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `Task ${i}`, eventTitle: 'A long event name '.repeat(3), dueDate: '2026-09-18' }));
    const { text } = renderTelegramUpdate(model({ overdue: many, dueThisWeek: many.map((t) => ({ ...t, dueDate: '2026-09-23' })) }));
    expect(text).toContain('…and 35 more');
    expect(text.length).toBeLessThan(4096);
  });

  it('adds buttons only for https app urls; "Review new events" only when there are new events', () => {
    const withNew = renderTelegramUpdate(model());
    expect(withNew.buttons.map((b) => b.url)).toEqual([
      'https://aheadoftime.app/dashboard?scan=true',
      'https://aheadoftime.app/dashboard',
    ]);
    expect(renderTelegramUpdate(model({ newEvents: [] })).buttons.map((b) => b.text)).toEqual(['📋 Open my week']);
    expect(renderTelegramUpdate(model({ appUrl: 'http://localhost:3000' })).buttons).toEqual([]);
  });
});

describe('renderEmailUpdate', () => {
  it('has a subject, brand header, all three sections and the plan steps (up to 8)', () => {
    const { subject, html, text } = renderEmailUpdate(model());
    expect(subject).toBe('Your daily update: 1 overdue, 2 due this week, 1 new event');
    expect(html).toContain('Needs attention (1)');
    expect(html).toContain('This week (2)');
    expect(html).toContain('New on your calendar (1)');
    expect(html).toContain('#182A42');
    expect(html).toContain('#95BFB5');
    expect(text).toContain('Step 8');
    expect(text).not.toContain('Step 9');
    expect(text).toContain('…and 2 more steps');
  });

  it('escapes user-supplied text in the HTML and never emits raw tags', () => {
    const { html } = renderEmailUpdate(model());
    expect(html).toContain('&lt;party&gt;');
    expect(html).not.toContain('<party>');
    expect(html).toContain('Amsterdam &amp; friends');
  });

  it('links to Review when there are new events, otherwise to the week, and always to settings', () => {
    const withNew = renderEmailUpdate(model());
    expect(withNew.html).toContain('href="https://aheadoftime.app/dashboard?scan=true"');
    expect(withNew.html).toContain('Review &amp; build my plans');
    expect(withNew.text).toContain('https://aheadoftime.app/settings/credentials');
    const tasksOnly = renderEmailUpdate(model({ newEvents: [] }));
    expect(tasksOnly.html).toContain('href="https://aheadoftime.app/dashboard"');
    expect(tasksOnly.html).toContain('Open my week');
  });

  it('degrades without an https app url: no links, no logo image', () => {
    const { html, text } = renderEmailUpdate(model({ appUrl: '' }));
    expect(html).not.toContain('href=');
    expect(html).not.toContain('<img');
    expect(text).toContain('Open Ahead Of Time to see everything.');
  });
});
