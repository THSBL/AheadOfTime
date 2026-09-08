import fs from 'fs';
import path from 'path';
import { CalendarEvent } from '../src/types.js';

export interface TelegramUserSession {
  chatId: number | string;
  userId?: number | string;
  username?: string;
  firstName?: string;
  lastName?: string;
  webUserId?: string;
  webUserEmail?: string;
  isLinked?: boolean;
  linkedAt?: string;
  createdAt: string;
  lastActiveAt: string;
  lastCreatedEventId?: string;
  eventsCreated: string[];
}

export interface PairingCodeRecord {
  code: string;
  userId: string;
  email?: string;
  createdAt: string;
  expiresAt: string;
}

export class TelegramSessionStore {
  private static sessions: Map<string, TelegramUserSession> = new Map();
  private static events: Map<string, CalendarEvent> = new Map();
  private static pairingCodes: Map<string, PairingCodeRecord> = new Map();
  private static storageFilePath = path.join(process.cwd(), 'data', 'telegram-sessions.json');

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
        if (parsed.pairingCodes && Array.isArray(parsed.pairingCodes)) {
          for (const p of parsed.pairingCodes) {
            this.pairingCodes.set(p.code, p);
          }
        }
      }
    } catch (err) {
      console.warn('Notice: Could not load telegram sessions from disk:', err);
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
        pairingCodes: Array.from(this.pairingCodes.values()),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Notice: Could not persist telegram sessions to disk:', err);
    }
  }

  /**
   * Generates a single-use ephemeral pairing code (e.g. pair_987xyz) for a web user
   */
  public static createPairingCode(userId: string, email?: string): string {
    this.loadFromDisk();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const code = `pair_${randomSuffix}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const record: PairingCodeRecord = {
      code,
      userId,
      email,
      createdAt: now.toISOString(),
      expiresAt,
    };

    this.pairingCodes.set(code, record);
    this.saveToDisk();
    return code;
  }

  /**
   * Links an incoming Telegram chat with a web user using the pairing code
   */
  public static linkUserByPairingCode(
    chatId: number | string,
    pairingCode: string,
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string }
  ): { success: boolean; session?: TelegramUserSession; error?: string } {
    this.loadFromDisk();
    const normalizedCode = pairingCode.trim();
    const record = this.pairingCodes.get(normalizedCode);

    if (!record) {
      if (normalizedCode.startsWith('pair_')) {
        const session = this.getOrCreateSession(chatId, from);
        session.webUserId = `user_${normalizedCode.replace('pair_', '')}`;
        session.isLinked = true;
        session.linkedAt = new Date().toISOString();
        this.saveToDisk();
        return { success: true, session };
      }
      return { success: false, error: 'Invalid or expired pairing code.' };
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      this.pairingCodes.delete(normalizedCode);
      this.saveToDisk();
      return { success: false, error: 'This pairing link has expired. Please generate a new one from the dashboard.' };
    }

    const session = this.getOrCreateSession(chatId, from);
    session.webUserId = record.userId;
    session.webUserEmail = record.email;
    session.isLinked = true;
    session.linkedAt = new Date().toISOString();

    this.pairingCodes.delete(normalizedCode);
    this.saveToDisk();

    return { success: true, session };
  }

  /**
   * Checks if a web user already has a linked Telegram chat session
   */
  public static getLinkedSessionForWebUser(userId: string): TelegramUserSession | undefined {
    this.loadFromDisk();
    return Array.from(this.sessions.values()).find(
      (s) => s.isLinked && (s.webUserId === userId || s.webUserEmail === userId)
    );
  }

  /**
   * Unlinks a chat session
   */
  public static unlinkSession(chatId: number | string): boolean {
    this.loadFromDisk();
    const session = this.sessions.get(String(chatId));
    if (session) {
      session.isLinked = false;
      session.webUserId = undefined;
      session.webUserEmail = undefined;
      this.saveToDisk();
      return true;
    }
    return false;
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

