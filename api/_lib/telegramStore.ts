import fs from 'fs';
import path from 'path';
import type { CalendarEvent } from './types.js';

export interface TelegramUserSession {
  chatId: number | string;
  userId?: number | string;
  username?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  lastActiveAt: string;
  lastCreatedEventId?: string;
  eventsCreated: string[];
}

export class TelegramSessionStore {
  private static sessions: Map<string, TelegramUserSession> = new Map();
  private static events: Map<string, CalendarEvent> = new Map();
  private static storageFilePath = process.env.VERCEL
    ? path.join('/tmp', 'telegram-sessions.json')
    : path.join(process.cwd(), 'data', 'telegram-sessions.json');

  static {
    this.loadFromDisk();
  }

  private static loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.sessions && Array.isArray(parsed.sessions)) {
          for (const s of parsed.sessions) {
            this.sessions.set(String(s.chatId), s);
          }
        }
        if (parsed.events && Array.isArray(parsed.events)) {
          for (const ev of parsed.events) {
            this.events.set(ev.id, ev);
          }
        }
      }
    } catch (err) {
      // Non-critical cache read
    }
  }

  private static saveToDisk(): void {
    try {
      const dataDir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const data = {
        sessions: Array.from(this.sessions.values()),
        events: Array.from(this.events.values()),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      // Non-critical cache write
    }
  }

  public static getOrCreateSession(
    chatId: number | string,
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string }
  ): TelegramUserSession {
    this.loadFromDisk();
    const key = String(chatId);
    let session = this.sessions.get(key);
    const now = new Date().toISOString();

    if (!session) {
      session = {
        chatId,
        userId: from?.id,
        username: from?.username,
        firstName: from?.first_name,
        lastName: from?.last_name,
        createdAt: now,
        lastActiveAt: now,
        eventsCreated: [],
      };
      this.sessions.set(key, session);
    } else {
      session.lastActiveAt = now;
      if (from?.username) session.username = from.username;
      if (from?.first_name) session.firstName = from.first_name;
      if (from?.last_name) session.lastName = from.last_name;
    }

    this.saveToDisk();
    return session;
  }

  public static recordEventCreated(chatId: number | string, event: CalendarEvent): void {
    this.loadFromDisk();
    const session = this.getOrCreateSession(chatId);
    session.lastCreatedEventId = event.id;
    if (!session.eventsCreated.includes(event.id)) {
      session.eventsCreated.push(event.id);
    }
    this.events.set(event.id, event);
    this.saveToDisk();
  }

  public static getEvent(eventId: string): CalendarEvent | undefined {
    this.loadFromDisk();
    return this.events.get(eventId);
  }

  public static getAllEvents(): CalendarEvent[] {
    this.loadFromDisk();
    return Array.from(this.events.values());
  }

  public static getRecentEventsForChat(chatId: number | string): CalendarEvent[] {
    this.loadFromDisk();
    const session = this.sessions.get(String(chatId));
    if (!session) return [];
    return session.eventsCreated
      .map((id) => this.events.get(id))
      .filter((ev): ev is CalendarEvent => Boolean(ev));
  }

  public static getAllSessions(): TelegramUserSession[] {
    this.loadFromDisk();
    return Array.from(this.sessions.values());
  }
}
