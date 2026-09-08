import fs from 'fs';
import path from 'path';
import { WhatsAppEventSessionState, WhatsAppSessionStatus, WhatsAppTranscriptMessage } from '../src/types/whatsapp.js';
import { TMinusMilestone } from '../src/types.js';

const SESSIONS_FILE_PATH = path.join(process.cwd(), 'data', 'whatsapp_sessions.json');

// Ensure data directory exists
try {
  const dir = path.dirname(SESSIONS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch (err) {
  console.warn('Could not create data directory for WhatsApp sessions:', err);
}

// In-memory sessions store
const sessionsMap = new Map<string, WhatsAppEventSessionState>();

// Load persisted sessions on startup
function loadPersistedSessions(): void {
  try {
    if (fs.existsSync(SESSIONS_FILE_PATH)) {
      const raw = fs.readFileSync(SESSIONS_FILE_PATH, 'utf-8');
      const data: WhatsAppEventSessionState[] = JSON.parse(raw);
      if (Array.isArray(data)) {
        data.forEach((session) => {
          sessionsMap.set(session.sessionId, session);
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load persisted WhatsApp sessions:', err);
  }
}

// Save sessions to disk
function persistSessions(): void {
  try {
    const list = Array.from(sessionsMap.values());
    fs.writeFileSync(SESSIONS_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist WhatsApp sessions to disk:', err);
  }
}

// Initialize on module load
loadPersistedSessions();

export class WhatsAppSessionStore {
  /**
   * Generates a deterministic or random session ID
   */
  public static generateSessionId(phoneNumber: string, eventId: string): string {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    return `wa-sess-${cleanPhone}-${eventId}`;
  }

  /**
   * Retrieves session by sessionId
   */
  public static getSession(sessionId: string): WhatsAppEventSessionState | null {
    return sessionsMap.get(sessionId) || null;
  }

  /**
   * Finds the most recent active session for a phone number
   */
  public static getActiveSessionByPhone(phoneNumber: string): WhatsAppEventSessionState | null {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const now = new Date().toISOString();

    const matching = Array.from(sessionsMap.values())
      .filter((s) => s.phoneNumber.replace(/[^0-9]/g, '') === cleanPhone)
      .sort((a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime());

    for (const session of matching) {
      // Check if session hasn't completed or expired
      if (
        session.status !== 'CONFIRMED_SYNCED' &&
        session.status !== 'IGNORED' &&
        session.status !== 'EXPIRED'
      ) {
        if (session.sessionExpiresAt > now) {
          return session;
        } else {
          session.status = 'EXPIRED';
        }
      }
    }

    return matching[0] || null;
  }

  /**
   * Checks if proactive outreach was already sent for this event ID to this phone within the last 7 days
   */
  public static hasRecentOutreach(phoneNumber: string, eventId: string): boolean {
    const sessionId = this.generateSessionId(phoneNumber, eventId);
    const existing = sessionsMap.get(sessionId);
    if (!existing) return false;

    const outreachTime = new Date(existing.createdAt).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return outreachTime > sevenDaysAgo;
  }

  /**
   * Saves or updates a session
   */
  public static saveSession(session: WhatsAppEventSessionState): WhatsAppEventSessionState {
    session.lastInteractionAt = new Date().toISOString();
    sessionsMap.set(session.sessionId, session);
    persistSessions();
    return session;
  }

  /**
   * Updates session status and appends a transcript message
   */
  public static recordMessage(
    sessionId: string,
    message: Omit<WhatsAppTranscriptMessage, 'id' | 'timestamp'>,
    newStatus?: WhatsAppSessionStatus
  ): WhatsAppEventSessionState | null {
    const session = sessionsMap.get(sessionId);
    if (!session) return null;

    const fullMessage: WhatsAppTranscriptMessage = {
      id: `wa-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...message,
    };

    session.messagesTranscript.push(fullMessage);
    session.lastInteractionAt = fullMessage.timestamp;
    if (newStatus) {
      session.status = newStatus;
    }

    sessionsMap.set(sessionId, session);
    persistSessions();
    return session;
  }

  /**
   * Stores generated milestones on the session
   */
  public static attachGeneratedMilestones(
    sessionId: string,
    milestones: TMinusMilestone[],
    summaryText: string
  ): WhatsAppEventSessionState | null {
    const session = sessionsMap.get(sessionId);
    if (!session) return null;

    session.generatedMilestones = milestones;
    session.conversationalSummary = summaryText;
    session.status = 'MILESTONES_PENDING_CONFIRMATION';
    session.lastInteractionAt = new Date().toISOString();

    sessionsMap.set(sessionId, session);
    persistSessions();
    return session;
  }

  /**
   * Lists all sessions (optionally filtered)
   */
  public static getAllSessions(): WhatsAppEventSessionState[] {
    return Array.from(sessionsMap.values()).sort(
      (a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime()
    );
  }

  /**
   * Deletes a session
   */
  public static deleteSession(sessionId: string): boolean {
    const deleted = sessionsMap.delete(sessionId);
    if (deleted) persistSessions();
    return deleted;
  }

  /**
   * Clears all demo sessions
   */
  public static clearAll(): void {
    sessionsMap.clear();
    persistSessions();
  }
}
