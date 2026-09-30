import { describe, it, expect } from 'vitest';
import { renderTelegramUpdate, renderEmailUpdate, updateSubject, hasUpdateContent, lateLabel, dueLabel, type DailyUpdateModel } from './dailyUpdateTemplate';

function model(overrides: Partial<DailyUpdateModel> = {}): DailyUpdateModel {
  return {
    today: '2026-09-21',
    overdue: [{ title: 'Send invites', eventTitle: "Maya's <party>", dueDate: '2026-09-18' }],
    dueThisWeek: [
      { title: 'Order cake', eventTitle: "Maya's <party>", dueDate: '2026-09-22' },
      { title: 'Buy drinks', eventTitle: "Maya's <party>", dueDate: '2026-09-25' },
    ],
    newEvents: [{ title: 'Amsterdam & friends', eventDate: '2026-10-12', steps: [{ date: '2026-10-01', title: 'Book hotel' }] }],
    pendingSync: { plans: 2, tasks: 7 },
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
  it('summarises only the non-empty parts, titled by frequency', () => {
    expect(updateSubject(model())).toBe('Your daily update: 1 late · 2 this week · 1 new event · 7 pending sync');
    expect(updateSubject(model({ frequency: 'weekly', overdue: [], newEvents: [], pendingSync: null }))).toBe('Your week ahead: 2 this week');
    expect(updateSubject(model({ overdue: [], dueThisWeek: [], newEvents: [], pendingSync: null }))).toBe('Your daily update');
  });

  it('knows when there is nothing to say', () => {
    expect(hasUpdateContent(model())).toBe(true);
    expect(hasUpdateContent(model({ overdue: [], dueThisWeek: [], newEvents: [], pendingSync: null }))).toBe(false);
    expect(hasUpdateContent(model({ overdue: [], dueThisWeek: [], newEvents: [] }))).toBe(true);
  });
});

describe('renderTelegramUpdate', () => {
  it('this week first (late on top), then new events, then pending sync; no prep steps', () => {
    const { text } = renderTelegramUpdate(model());
    expect(text.indexOf('This week (3 · 1 late)')).toBeLessThan(text.indexOf('New in your calendar (1)'));
    expect(text.indexOf('New in your calendar')).toBeLessThan(text.indexOf('Pending sync'));
    expect(text.indexOf('Send invites')).toBeLessThan(text.indexOf('Order cake'));
    expect(text).toContain('3 days late');
    expect(text).toContain('tomorrow');
    expect(text).toContain('2 plans · 7 tasks not in your calendar yet');
    expect(text).not.toContain('Book hotel');
    expect(text).not.toMatch(/decision/i);
  });

  it('escapes HTML in user-supplied titles', () => {
    const out = renderTelegramUpdate(model());
    expect(out.parse_mode).toBe('HTML');
    expect(out.text).toContain('&lt;party&gt;');
    expect(out.text).not.toContain('<party>');
    expect(out.text).toContain('Amsterdam &amp; friends');
  });

  it('caps the week at 6 tasks and stays short', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `Task ${i}`, eventTitle: 'Event', dueDate: '2026-09-18' }));
    const { text } = renderTelegramUpdate(model({ overdue: many, dueThisWeek: [] }));
    expect(text).toContain('…and 34 more in the app');
    expect(text.length).toBeLessThan(1500);
  });

  it('buttons: my week always, plan new events and sync now only when relevant, none without https', () => {
    expect(renderTelegramUpdate(model()).buttons.map((b) => b.url)).toEqual([
      'https://aheadoftime.app/dashboard',
      'https://aheadoftime.app/dashboard?scan=true',
      'https://aheadoftime.app/dashboard?sync=pending',
    ]);
    expect(renderTelegramUpdate(model({ newEvents: [], pendingSync: null })).buttons.map((b) => b.text)).toEqual(['📋 Open my week']);
    expect(renderTelegramUpdate(model({ appUrl: 'http://localhost:3000' })).buttons).toEqual([]);
  });
});

describe('renderEmailUpdate', () => {
  it('has the three sections, brand colours and links, and nothing else', () => {
    const { subject, html, text } = renderEmailUpdate(model({ frequency: 'weekly' }));
    expect(subject).toBe('Your week ahead: 1 late · 2 this week · 1 new event · 7 pending sync');
    expect(html).toContain('This week (3 · 1 late)');
    expect(html).toContain('New in your calendar (1)');
    expect(html).toContain('Pending sync');
    expect(html).toContain('#182A42');
    expect(html).toContain('href="https://aheadoftime.app/dashboard?sync=pending"');
    expect(html).not.toContain('Book hotel');
    expect(html).not.toMatch(/decision/i);
    expect(text).toContain('https://aheadoftime.app/settings/updates');
  });

  it('escapes user-supplied text and degrades without an https app url', () => {
    expect(renderEmailUpdate(model()).html).toContain('&lt;party&gt;');
    const offline = renderEmailUpdate(model({ appUrl: '' }));
    expect(offline.html).not.toContain('href=');
    expect(offline.html).not.toContain('<img');
  });
});
