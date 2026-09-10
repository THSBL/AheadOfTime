import { query } from './db.js';
import { CalendarEvent, TMinusMilestone, Deliverable, EventCategory, MilestoneCategory } from '../src/types.js';

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
  pairCode?: string;
  createdAt: string;
  lastActiveAt: string;
  lastCreatedEventId?: string;
  eventsCreated: string[];
}

export interface PairingCodeRecord {
  code: string;
  userId?: string;
  email?: string;
  status: 'pending' | 'linked' | 'expired';
  linked: boolean;
  telegram_linked?: boolean;
  isLinked?: boolean;
  chatId?: number | string;
  telegram_chat_id?: number | string;
  username?: string;
  linkedUsername?: string;
  linkedAt?: string;
  createdAt: string | number;
  expiresAt: string | number;
}

// -----------------------------------------------------------------------------
// Internal row shapes (subset of columns we actually read/write)
// -----------------------------------------------------------------------------

interface IntegrationAccountRow {
  id: string;
  user_id: string | null;
  channel: string;
  external_id: string;
  external_username: string | null;
  is_linked: boolean;
  linked_at: string | Date | null;
  last_active_at: string | Date;
  metadata: Record<string, any>;
  user_email?: string | null;
}

interface EventRow {
  id: string;
  user_id: string;
  title: string;
  category: string;
  event_date: string | Date;
  end_date: string | Date | null;
  event_time: string | null;
  location: string | null;
  status: string;
  source_channel: string;
  context: Record<string, any>;
  structured_payload: any;
  raw_input: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface MilestoneRow {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  category: string | null;
  calculated_date: string | Date;
  status: string;
  kind: string;
  confirmed_at: string | Date | null;
  confirmed_via: string | null;
  deliverables: any;
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function isLikelyEmail(value?: string | null): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

/**
 * Every Telegram chat that never went through a real pairing flow still
 * needs *some* row in `users` to satisfy events.user_id's NOT NULL FK -
 * see the class doc comment below ("Ownership fallback") for why this
 * exists and what its limitations are.
 */
function placeholderEmailForChat(chatId: number | string): string {
  return `telegram-${String(chatId)}@unlinked.aheadoftime.local`;
}

function toIsoString(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: string | Date | null | undefined): string | undefined {
  const iso = toIsoString(value);
  return iso ? iso.substring(0, 10) : undefined;
}

/** Finds a user by email, creating one if it doesn't exist yet (per
 * schema.sql's own doc comment: users are populated on first verified
 * contact, "there is no separate sign up step"). Returns the user's uuid. */
async function findOrCreateUserByEmail(email: string, name?: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const rows = await query<{ id: string }>(
    `INSERT INTO users (email, name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [normalized, name || null]
  );
  return rows[0].id;
}

async function getOrCreatePlaceholderUserId(chatId: number | string): Promise<string> {
  return findOrCreateUserByEmail(placeholderEmailForChat(chatId), 'Unlinked Telegram User');
}

/** Parses an external_id column value back into the same number/string shape
 * chatIds have always been passed around as, so identity comparisons like
 * `chatId !== 123456789` used across call sites keep working. */
function parseChatId(externalId: string): number | string {
  return /^-?\d+$/.test(externalId) ? Number(externalId) : externalId;
}

function rowToSession(row: IntegrationAccountRow): TelegramUserSession {
  const metadata = row.metadata || {};
  return {
    chatId: parseChatId(row.external_id),
    userId: metadata.telegramUserId,
    username: row.external_username || undefined,
    firstName: metadata.firstName,
    lastName: metadata.lastName,
    webUserId: row.user_id || undefined,
    webUserEmail: row.user_email || undefined,
    isLinked: Boolean(row.is_linked),
    linkedAt: toIsoString(row.linked_at),
    pairCode: metadata.pairCode,
    createdAt: metadata.createdAt || toIsoString(row.last_active_at) || new Date().toISOString(),
    lastActiveAt: toIsoString(row.last_active_at) || new Date().toISOString(),
    lastCreatedEventId: metadata.lastCreatedEventId,
    eventsCreated: Array.isArray(metadata.eventsCreated) ? metadata.eventsCreated : [],
  };
}

function computeTMinus(
  eventDate: string,
  eventTime: string | null | undefined,
  calculatedDate: Date
): { label: string; offsetMinutes: number } {
  const eventStart = new Date(`${eventDate}T${eventTime || '09:00'}:00`);
  const diffMs = calculatedDate.getTime() - eventStart.getTime();
  const offsetMinutes = Math.round(diffMs / 60000);
  const days = Math.round(Math.abs(offsetMinutes) / 1440);
  const label = offsetMinutes <= 0 ? `T-${days}d` : `T+${days}d`;
  return { label, offsetMinutes };
}

function rowToMilestone(row: MilestoneRow, eventDate: string, eventTime: string | null): TMinusMilestone {
  const calculatedDate = row.calculated_date instanceof Date ? row.calculated_date : new Date(row.calculated_date);
  const { label, offsetMinutes } = computeTMinus(eventDate, eventTime, calculatedDate);
  return {
    id: row.id,
    eventId: row.event_id,
    tMinusLabel: label,
    tMinusOffsetMinutes: offsetMinutes,
    calculatedDate: toDateOnly(calculatedDate) || eventDate,
    title: row.title,
    description: row.description || undefined,
    category: (row.category as MilestoneCategory) || 'general',
    status: (row.status as TMinusMilestone['status']) || 'pending',
    completedAt: row.status === 'completed' ? toIsoString(row.confirmed_at) : undefined,
    kind: (row.kind as TMinusMilestone['kind']) || 'milestone',
    deliverables: Array.isArray(row.deliverables) ? (row.deliverables as Deliverable[]) : [],
  };
}

function rowToCalendarEvent(row: EventRow, milestoneRows: MilestoneRow[]): CalendarEvent {
  const eventDate = toDateOnly(row.event_date) as string;
  return {
    id: row.id,
    title: row.title,
    category: row.category as EventCategory,
    eventDate,
    endDate: toDateOnly(row.end_date),
    eventTime: row.event_time || undefined,
    location: row.location || undefined,
    status: row.status as CalendarEvent['status'],
    context: row.context || {},
    structuredPayload: row.structured_payload || undefined,
    milestones: milestoneRows
      .filter((m) => m.event_id === row.id)
      .map((m) => rowToMilestone(m, eventDate, row.event_time)),
    rawInputSnippet: row.raw_input || undefined,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString(),
  };
}

/**
 * Postgres-backed replacement for the old in-memory/JSON-file
 * TelegramSessionStore. See server/db/schema.sql for the table
 * definitions this maps onto.
 *
 * OWNERSHIP FALLBACK (read this before touching linking logic):
 * `events.user_id` is NOT NULL, but a Telegram chat can create events
 * long before (or without ever) being paired to a real web account - the
 * old code allowed this freely since "ownership" was just an optional
 * string field on an in-memory session. To avoid dropping those events,
 * any chat that isn't yet linked to a real user gets a synthetic
 * placeholder `users` row (email `telegram-<chatId>@unlinked.aheadoftime.local`,
 * see placeholderEmailForChat/getOrCreatePlaceholderUserId) so the FK is
 * satisfiable. This placeholder id is stored on the integration_accounts
 * row's `user_id` column purely to satisfy referential integrity for
 * events created through it - it does NOT flip `is_linked` to true and is
 * NOT the same thing as a genuine account link. If the chat is later
 * linked to a real account via `linkUserByPairingCode`, any events already
 * recorded under that chat's placeholder user are migrated over to the
 * real account at link time (see the migration step in that method) so
 * nothing gets stranded. `manualLink` never has a real account to migrate
 * to (it only ever assigns the same placeholder), so no migration applies
 * there.
 */
export class TelegramSessionStore {
  private static async getAccountRow(chatId: number | string): Promise<IntegrationAccountRow | undefined> {
    const rows = await query<IntegrationAccountRow>(
      `SELECT ia.*, u.email AS user_email
       FROM integration_accounts ia
       LEFT JOIN users u ON u.id = ia.user_id
       WHERE ia.channel = 'telegram' AND ia.external_id = $1`,
      [String(chatId)]
    );
    return rows[0];
  }

  /**
   * Generates a single-use ephemeral pairing token (e.g. pair_4bh0ms) for a web user.
   *
   * JUDGMENT CALL: `pairing_codes.user_id` is a real FK to `users.id`, so a
   * plain placeholder string like the old default `'user_default'` can no
   * longer be stored directly. If `email` (or, failing that, `userId` when
   * it happens to look like an email) resolves to a real address, we
   * find-or-create that user and use its id. Otherwise we leave
   * `pairing_codes.user_id` NULL (the column is nullable) - the code is
   * still created and can still be redeemed by `linkUserByPairingCode`,
   * which backfills a synthetic per-chat placeholder user at redemption
   * time if it's still NULL, so it never ends up with a real owner unless
   * a later flow supplies one. Flagged for review.
   */
  public static async createPairingCode(userId: string = 'user_default', email?: string): Promise<string> {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const code = `pair_${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let resolvedUserId: string | null = null;
    if (isLikelyEmail(email)) {
      resolvedUserId = await findOrCreateUserByEmail(email);
    } else if (isLikelyEmail(userId)) {
      resolvedUserId = await findOrCreateUserByEmail(userId);
    }

    await query(
      `INSERT INTO pairing_codes (code, user_id, channel, status, created_at, expires_at)
       VALUES ($1, $2, 'telegram', 'pending', now(), $3)`,
      [code, resolvedUserId, expiresAt.toISOString()]
    );

    console.log(`[Telegram Session Store] Created pending pairing code: ${code}`);
    return code;
  }

  /**
   * Links an incoming Telegram chat with a web user using the pairing code.
   */
  public static async linkUserByPairingCode(
    chatId: number | string,
    pairingCode: string,
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string }
  ): Promise<{ success: boolean; session?: TelegramUserSession; error?: string }> {
    const normalizedCode = pairingCode.trim();
    const username = from?.username || from?.first_name || 'Telegram User';

    const rows = await query<{ code: string; user_id: string | null; status: string }>(
      `SELECT code, user_id, status FROM pairing_codes WHERE code = $1`,
      [normalizedCode]
    );
    let record = rows[0];

    if (!record) {
      // If code starts with pair_, create an ad-hoc valid record for smooth pairing,
      // matching the old "be lenient about unknown-but-well-formed codes" behavior.
      if (!normalizedCode.startsWith('pair_')) {
        return { success: false, error: 'Invalid pairing token. Please generate a new link in your dashboard.' };
      }
      record = { code: normalizedCode, user_id: null, status: 'linked' };
    }

    // No real email was ever collected for this code (createPairingCode's
    // no-email path, or this ad-hoc branch) - attach the same synthetic
    // per-chat placeholder used elsewhere so pairing_codes.user_id always
    // resolves back to a queryable account. See class doc comment.
    const resolvedUserId = record.user_id || (await getOrCreatePlaceholderUserId(chatId));

    await query(
      `INSERT INTO pairing_codes (code, user_id, channel, status, created_at, expires_at)
       VALUES ($1, $2, 'telegram', 'linked', now(), $3)
       ON CONFLICT (code) DO UPDATE SET status = 'linked', user_id = COALESCE(pairing_codes.user_id, EXCLUDED.user_id)`,
      [normalizedCode, resolvedUserId, new Date(Date.now() + 86400000).toISOString()]
    );

    // If this chat already created events anonymously (under its own
    // placeholder user, before ever being linked) and is now being linked
    // to a real account, migrate those events over rather than stranding
    // them under a placeholder the user will never see again.
    const chatPlaceholderEmail = placeholderEmailForChat(chatId);
    const placeholderRows = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [chatPlaceholderEmail]);
    const placeholderUserId = placeholderRows[0]?.id;
    if (placeholderUserId && placeholderUserId !== resolvedUserId) {
      await query(`UPDATE events SET user_id = $1 WHERE user_id = $2`, [resolvedUserId, placeholderUserId]);
    }

    // Ensure the chat's integration_account exists, then attach the pairing code's user.
    await this.getOrCreateSession(chatId, from);
    await query(
      `UPDATE integration_accounts
       SET user_id = $2, is_linked = true, linked_at = now(), external_username = $3, last_active_at = now()
       WHERE channel = 'telegram' AND external_id = $1`,
      [String(chatId), resolvedUserId, username]
    );

    const session = rowToSession((await this.getAccountRow(chatId))!);

    console.log(
      `[Telegram Webhook] Successfully linked pairCode: ${normalizedCode} to chatId: ${chatId} (@${from?.username || 'user'})`
    );

    return { success: true, session };
  }

  /**
   * Manual force-link bypass.
   *
   * JUDGMENT CALL: this endpoint never collected an email in the old code
   * either (it hard-coded `userId: 'user_default'`), so there is still no
   * real identity to attach here. To keep it functional (is_linked=true
   * with a satisfiable FK) it now attaches the same synthetic placeholder
   * user described in the class doc comment, keyed by the resolved chat.
   * That means "manually linked" no longer means "linked to a specific
   * real web account" - it means "this chat is marked linked, owned by a
   * placeholder account unique to that chat." Flagged for review.
   */
  public static async manualLink(
    code?: string,
    username: string = 'Telegram User',
    chatId?: number | string
  ): Promise<PairingCodeRecord> {
    const targetCode = code || `pair_manual_${Date.now()}`;
    const nowIso = new Date().toISOString();

    let resolvedChatId = chatId;
    let resolvedUsername = username.replace(/^@/, '');

    const activeRows = await query<IntegrationAccountRow>(
      `SELECT ia.*, u.email AS user_email
       FROM integration_accounts ia
       LEFT JOIN users u ON u.id = ia.user_id
       WHERE ia.channel = 'telegram' AND ia.external_id NOT IN ('123456789')
       ORDER BY ia.last_active_at DESC
       LIMIT 1`
    );
    const activeSession = activeRows[0] ? rowToSession(activeRows[0]) : undefined;

    if (activeSession) {
      resolvedChatId = resolvedChatId ?? activeSession.chatId;
      if (resolvedUsername === 'Telegram User' && (activeSession.username || activeSession.firstName)) {
        resolvedUsername = activeSession.username || activeSession.firstName || 'Telegram User';
      }
    }

    const finalChatId = resolvedChatId ?? 123456789;
    const placeholderUserId = await getOrCreatePlaceholderUserId(finalChatId);

    await query(
      `INSERT INTO pairing_codes (code, user_id, channel, status, created_at, expires_at)
       VALUES ($1, $2, 'telegram', 'linked', now(), $3)
       ON CONFLICT (code) DO UPDATE SET status = 'linked', user_id = EXCLUDED.user_id`,
      [targetCode, placeholderUserId, new Date(Date.now() + 86400000).toISOString()]
    );

    await this.getOrCreateSession(finalChatId, { username: resolvedUsername });
    await query(
      `UPDATE integration_accounts
       SET user_id = $2, is_linked = true, linked_at = now(), external_username = $3, last_active_at = now()
       WHERE channel = 'telegram' AND external_id = $1`,
      [String(finalChatId), placeholderUserId, resolvedUsername]
    );

    return {
      code: targetCode,
      userId: placeholderUserId,
      status: 'linked',
      linked: true,
      telegram_linked: true,
      isLinked: true,
      chatId: finalChatId,
      telegram_chat_id: finalChatId,
      username: resolvedUsername,
      linkedUsername: resolvedUsername,
      linkedAt: nowIso,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };
  }

  /**
   * Checks status of a pairing code or web user.
   */
  public static async getPairingStatus(
    code?: string,
    userId: string = 'user_default'
  ): Promise<{
    ok: boolean;
    linked: boolean;
    status: string;
    username?: string;
    chatId?: number | string;
    telegram_linked: boolean;
    isLinked: boolean;
    telegram_chat_id?: number | string;
    session?: TelegramUserSession | null;
  }> {
    const activeRows = await query<IntegrationAccountRow>(
      `SELECT ia.*, u.email AS user_email
       FROM integration_accounts ia
       LEFT JOIN users u ON u.id = ia.user_id
       WHERE ia.channel = 'telegram' AND ia.external_id NOT IN ('123456789')
       ORDER BY ia.last_active_at DESC
       LIMIT 1`
    );
    const latestActiveSession = activeRows[0] ? rowToSession(activeRows[0]) : undefined;

    if (code) {
      const normalizedCode = code.trim();
      const codeRows = await query<{ code: string; user_id: string | null; status: string; user_email: string | null }>(
        `SELECT pc.code, pc.user_id, pc.status, u.email AS user_email
         FROM pairing_codes pc
         LEFT JOIN users u ON u.id = pc.user_id
         WHERE pc.code = $1`,
        [normalizedCode]
      );
      const record = codeRows[0];

      if (record && record.status === 'linked') {
        const linkedAccountRows = record.user_id
          ? await query<IntegrationAccountRow>(
              `SELECT ia.*, u.email AS user_email
               FROM integration_accounts ia
               LEFT JOIN users u ON u.id = ia.user_id
               WHERE ia.channel = 'telegram' AND ia.user_id = $1
               ORDER BY ia.last_active_at DESC
               LIMIT 1`,
              [record.user_id]
            )
          : [];
        const session = linkedAccountRows[0] ? rowToSession(linkedAccountRows[0]) : undefined;
        const username = record.user_email || session?.username || 'Telegram User';
        const chatId = session?.chatId;
        return {
          ok: true,
          linked: true,
          status: 'linked',
          username,
          chatId,
          telegram_linked: true,
          isLinked: true,
          telegram_chat_id: chatId,
          session: session || null,
        };
      } else if (record && latestActiveSession) {
        // Auto-link pending pairing code with the user currently chatting with the bot!
        await query(`UPDATE pairing_codes SET status = 'linked' WHERE code = $1`, [normalizedCode]);
        await query(
          `UPDATE integration_accounts
           SET user_id = COALESCE($2, user_id), is_linked = true, linked_at = now()
           WHERE channel = 'telegram' AND external_id = $1`,
          [String(latestActiveSession.chatId), record.user_id]
        );
        const refreshedRow = await this.getAccountRow(latestActiveSession.chatId);
        const refreshedSession = refreshedRow ? rowToSession(refreshedRow) : latestActiveSession;

        return {
          ok: true,
          linked: true,
          status: 'linked',
          username: refreshedSession.username || refreshedSession.firstName || 'Telegram User',
          chatId: refreshedSession.chatId,
          telegram_linked: true,
          isLinked: true,
          telegram_chat_id: refreshedSession.chatId,
          session: refreshedSession,
        };
      } else if (record) {
        return {
          ok: true,
          linked: false,
          status: record.status || 'pending',
          telegram_linked: false,
          isLinked: false,
          session: null,
        };
      }
    }

    // Lookup by webUserId (expected to be an email - see class doc comment on getAllEvents)
    const session = await this.getLinkedSessionForWebUser(userId);
    if (session && session.isLinked) {
      const username = session.username || session.firstName || 'Telegram User';
      return {
        ok: true,
        linked: true,
        status: 'linked',
        username,
        chatId: session.chatId,
        telegram_linked: true,
        isLinked: true,
        telegram_chat_id: session.chatId,
        session,
      };
    }

    // Fallback: If user is actively chatting with the bot, recognize them as connected!
    if (latestActiveSession) {
      await query(
        `UPDATE integration_accounts SET is_linked = true WHERE channel = 'telegram' AND external_id = $1`,
        [String(latestActiveSession.chatId)]
      );
      const username = latestActiveSession.username || latestActiveSession.firstName || 'Telegram User';
      return {
        ok: true,
        linked: true,
        status: 'linked',
        username,
        chatId: latestActiveSession.chatId,
        telegram_linked: true,
        isLinked: true,
        telegram_chat_id: latestActiveSession.chatId,
        session: { ...latestActiveSession, isLinked: true },
      };
    }

    return {
      ok: true,
      linked: false,
      status: 'not_linked',
      telegram_linked: false,
      isLinked: false,
      session: null,
    };
  }

  /**
   * Checks if a web user already has a linked Telegram chat session.
   * `userId` is treated as an email - see the class doc comment.
   */
  public static async getLinkedSessionForWebUser(userId: string): Promise<TelegramUserSession | undefined> {
    const rows = await query<IntegrationAccountRow>(
      `SELECT ia.*, u.email AS user_email
       FROM integration_accounts ia
       JOIN users u ON u.id = ia.user_id
       WHERE ia.channel = 'telegram' AND ia.is_linked = true AND lower(u.email) = lower($1)
       ORDER BY ia.last_active_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] ? rowToSession(rows[0]) : undefined;
  }

  /**
   * Unlinks a chat session.
   */
  public static async unlinkSession(chatId: number | string): Promise<boolean> {
    const rows = await query(
      `UPDATE integration_accounts
       SET is_linked = false, user_id = NULL, linked_at = NULL
       WHERE channel = 'telegram' AND external_id = $1
       RETURNING id`,
      [String(chatId)]
    );
    return rows.length > 0;
  }

  public static async getOrCreateSession(
    chatId: number | string,
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string }
  ): Promise<TelegramUserSession> {
    const key = String(chatId);
    const existing = await this.getAccountRow(chatId);
    const nowIso = new Date().toISOString();

    if (!existing) {
      const metadata = {
        firstName: from?.first_name,
        lastName: from?.last_name,
        telegramUserId: from?.id,
        eventsCreated: [] as string[],
        lastCreatedEventId: undefined as string | undefined,
        createdAt: nowIso,
      };
      const inserted = await query<IntegrationAccountRow>(
        `INSERT INTO integration_accounts (channel, external_id, external_username, is_linked, last_active_at, metadata)
         VALUES ('telegram', $1, $2, false, now(), $3)
         ON CONFLICT (channel, external_id) DO UPDATE SET last_active_at = now()
         RETURNING *`,
        [key, from?.username || null, JSON.stringify(metadata)]
      );
      const row = { ...inserted[0], user_email: null };
      return rowToSession(row);
    }

    const metadata = { ...(existing.metadata || {}) };
    if (from?.username) metadata.firstName = metadata.firstName;
    if (from?.first_name) metadata.firstName = from.first_name;
    if (from?.last_name) metadata.lastName = from.last_name;
    if (from?.id && !metadata.telegramUserId) metadata.telegramUserId = from.id;

    const updated = await query<IntegrationAccountRow>(
      `UPDATE integration_accounts
       SET external_username = COALESCE($2, external_username), last_active_at = now(), metadata = $3
       WHERE channel = 'telegram' AND external_id = $1
       RETURNING *`,
      [key, from?.username || null, JSON.stringify(metadata)]
    );
    const row = { ...updated[0], user_email: existing.user_email };
    return rowToSession(row);
  }

  public static async recordEventCreated(chatId: number | string, event: CalendarEvent): Promise<void> {
    const session = await this.getOrCreateSession(chatId);

    // Resolve the owning user: prefer a real linked account, otherwise fall
    // back to a per-chat placeholder so the NOT NULL events.user_id FK can
    // be satisfied without losing the event. See class doc comment.
    let ownerUserId = session.webUserId;
    if (!ownerUserId) {
      ownerUserId = await getOrCreatePlaceholderUserId(chatId);
      await query(
        `UPDATE integration_accounts SET user_id = $2 WHERE channel = 'telegram' AND external_id = $1 AND user_id IS NULL`,
        [String(chatId), ownerUserId]
      );
    }

    // Attach creator context if session is linked to a real web account (kept
    // for backward-compat with any code still reading event.context.webUserId).
    const context = { ...(event.context || {}) };
    if (session.webUserId || session.webUserEmail) {
      context.webUserId = session.webUserId;
      context.creatorEmail = session.webUserEmail;
    }

    const insertedEvent = await query<{ id: string }>(
      `INSERT INTO events (user_id, title, category, event_date, end_date, event_time, location, status, source_channel, context, structured_payload, raw_input, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'telegram', $9, $10, $11, now(), now())
       RETURNING id`,
      [
        ownerUserId,
        event.title,
        event.category,
        event.eventDate,
        event.endDate || null,
        event.eventTime || null,
        event.location || null,
        event.status,
        JSON.stringify(context),
        event.structuredPayload ? JSON.stringify(event.structuredPayload) : null,
        event.rawInputSnippet || null,
      ]
    );
    const eventId = insertedEvent[0].id;

    for (const milestone of event.milestones || []) {
      await query(
        `INSERT INTO milestones (event_id, title, description, category, calculated_date, status, kind, deliverables)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          eventId,
          milestone.title,
          milestone.description || null,
          milestone.category || null,
          milestone.calculatedDate,
          milestone.status || 'pending',
          milestone.kind || 'milestone',
          JSON.stringify(milestone.deliverables || []),
        ]
      );
    }

    // Reflect the DB-assigned id back onto the caller's object so downstream
    // code (e.g. the Telegram callback buttons keyed on event.id) refers to
    // the same id we can look back up.
    event.id = eventId;
    for (const milestone of event.milestones || []) {
      milestone.eventId = eventId;
    }
    event.context = context;

    const eventsCreated = Array.from(new Set([...(session.eventsCreated || []), eventId]));
    await query(
      `UPDATE integration_accounts
       SET metadata = jsonb_set(jsonb_set(metadata, '{eventsCreated}', $2::jsonb, true), '{lastCreatedEventId}', $3::jsonb, true)
       WHERE channel = 'telegram' AND external_id = $1`,
      [String(chatId), JSON.stringify(eventsCreated), JSON.stringify(eventId)]
    );

    console.log(`💾 Recorded event ${eventId} ("${event.title}") for chat ${chatId}.`);
  }

  public static async getEvent(eventId: string): Promise<CalendarEvent | undefined> {
    const eventRows = await query<EventRow>(`SELECT * FROM events WHERE id = $1`, [eventId]);
    const eventRow = eventRows[0];
    if (!eventRow) return undefined;
    const milestoneRows = await query<MilestoneRow>(`SELECT * FROM milestones WHERE event_id = $1`, [eventId]);
    return rowToCalendarEvent(eventRow, milestoneRows);
  }

  /**
   * `userId` is expected to be a verified email address (see the parallel
   * auth work referenced in the migration task). Guest/anonymous callers
   * get an empty list so logged-out users start with a clean slate.
   *
   * JUDGMENT CALL (security): the old in-memory implementation had a
   * `userId === 'all'` bypass that returned every stored event regardless
   * of ownership. That is dropped here on purpose - it is exactly the
   * shape of bug fixed in commit 2c0587e ("unauthenticated cross-user
   * Telegram event exposure"), and every current caller scopes by a real
   * email, so there is no legitimate use of an "all events" escape hatch
   * left to preserve.
   */
  public static async getAllEvents(userId?: string): Promise<CalendarEvent[]> {
    if (!userId) {
      return [];
    }

    const normUserId = userId.toLowerCase().trim();
    if (normUserId === 'guest' || normUserId === 'anonymous') {
      return [];
    }

    const eventRows = await query<EventRow>(
      `SELECT e.* FROM events e
       JOIN users u ON u.id = e.user_id
       WHERE lower(u.email) = lower($1)`,
      [normUserId]
    );
    if (eventRows.length === 0) return [];

    const eventIds = eventRows.map((e) => e.id);
    const milestoneRows = await query<MilestoneRow>(
      `SELECT * FROM milestones WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );

    return eventRows.map((row) => rowToCalendarEvent(row, milestoneRows));
  }

  public static async getRecentEventsForChat(chatId: number | string): Promise<CalendarEvent[]> {
    const account = await this.getAccountRow(chatId);
    if (!account) return [];
    const eventIds: string[] = Array.isArray(account.metadata?.eventsCreated) ? account.metadata.eventsCreated : [];
    if (eventIds.length === 0) return [];

    const eventRows = await query<EventRow>(`SELECT * FROM events WHERE id = ANY($1::uuid[])`, [eventIds]);
    if (eventRows.length === 0) return [];

    const milestoneRows = await query<MilestoneRow>(
      `SELECT * FROM milestones WHERE event_id = ANY($1::uuid[])`,
      [eventRows.map((e) => e.id)]
    );
    return eventRows.map((row) => rowToCalendarEvent(row, milestoneRows));
  }

  public static async getAllSessions(): Promise<TelegramUserSession[]> {
    const rows = await query<IntegrationAccountRow>(
      `SELECT ia.*, u.email AS user_email
       FROM integration_accounts ia
       LEFT JOIN users u ON u.id = ia.user_id
       WHERE ia.channel = 'telegram'`
    );
    return rows.map(rowToSession);
  }
}
