-- Ahead Of Time - Postgres schema
-- Run this once against a fresh database to create all tables.
-- Replaces the file-based TelegramSessionStore (integration_accounts,
-- pairing_codes, events, milestones) and lays the foundation for
-- multi-agent task coordination (agent_actions).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- Canonical user identity. Populated on first verified contact (either a
-- web sign-in via a verified Google access token, or a Telegram/WhatsApp
-- account being paired to an email) - there is no separate "sign up" step.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  timezone      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding/preference data (home location, family structure, etc.).
-- Kept separate from `users` since it's config that evolves independently.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_location     TEXT,
  family_structure  TEXT,
  calendar_scope    TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Any channel a user has connected: Telegram, WhatsApp, future ones.
-- Replaces TelegramSessionStore's in-memory/file session map.
CREATE TABLE IF NOT EXISTS integration_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE, -- nullable until linked
  channel             TEXT NOT NULL,           -- 'telegram' | 'whatsapp'
  external_id         TEXT NOT NULL,           -- chat_id / phone number
  external_username   TEXT,
  is_linked           BOOLEAN NOT NULL DEFAULT false,
  linked_at           TIMESTAMPTZ,
  last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB NOT NULL DEFAULT '{}',
  UNIQUE (channel, external_id)
);

-- One-time codes used to link a chat to a web account.
CREATE TABLE IF NOT EXISTS pairing_codes (
  code          TEXT PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | linked | expired
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

-- Events: trips, parties, projects - created from any channel.
-- Stable/queried fields are real columns; the flexible, still-evolving
-- bits (context, macro/sub-event structure) stay JSONB rather than
-- forcing a rigid shape prematurely.
CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  category            TEXT NOT NULL,
  event_date          DATE NOT NULL,
  end_date            DATE,
  event_time          TEXT,
  location            TEXT,
  status              TEXT NOT NULL DEFAULT 'intake_pending',
  source_channel      TEXT NOT NULL DEFAULT 'web', -- 'web' | 'telegram' | 'whatsapp'
  context             JSONB NOT NULL DEFAULT '{}',
  structured_payload  JSONB,
  raw_input           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date);

-- The actual actionable items - what agents will read, act on, and what
-- users confirm.
CREATE TABLE IF NOT EXISTS milestones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  category          TEXT,
  calculated_date   TIMESTAMPTZ NOT NULL,   -- when it's due - the key scheduling field
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | completed
  kind              TEXT NOT NULL DEFAULT 'milestone', -- milestone | deliverable
  confirmed_at      TIMESTAMPTZ,             -- did the user agree to this task
  confirmed_via     TEXT,                    -- 'web' | 'telegram' | 'whatsapp'
  deliverables      JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_milestones_due ON milestones(calculated_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_milestones_event ON milestones(event_id);

-- What an agent is/was supposed to do about a task, and when - lets
-- agents act on a staggered schedule instead of surfacing every decision
-- to the user on the same day. Nothing populates this table yet; it
-- exists so a future agent has a home to write to.
CREATE TABLE IF NOT EXISTS agent_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id    UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  agent_type      TEXT NOT NULL,           -- e.g. 'reminder_agent', 'booking_agent'
  action_type     TEXT NOT NULL,           -- e.g. 'notify', 'book', 'confirm_with_user'
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed | failed
  scheduled_for   TIMESTAMPTZ NOT NULL,
  performed_at    TIMESTAMPTZ,
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_actions_due ON agent_actions(scheduled_for) WHERE status = 'pending';

-- Bug/quality-signal log: every place the AI pipeline already silently
-- fails, falls back, or gets an empty/garbage response gets a row here
-- instead of just a console.warn nobody sees. high-severity rows are
-- pushed to the owner over Telegram in real time; medium/low rows are
-- rolled into a weekly Telegram digest instead of paging on every routine
-- model flake. This table is pure logging - nothing here changes what the
-- AI pipeline actually does with a request.
CREATE TABLE IF NOT EXISTS ai_quality_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE, -- nullable: pre-auth / unlinked Telegram chat
  event_id          UUID REFERENCES events(id) ON DELETE SET NULL, -- the CalendarEvent this was about, if any
  source_channel    TEXT NOT NULL,          -- 'web' | 'telegram' | 'whatsapp'
  signal_type       TEXT NOT NULL,          -- 'gemini_error' | 'gemini_fallback' | 'json_parse_failure' |
                                             -- 'explicit_failure_reply' | 'empty_plan_returned' | 'rapid_correction' |
                                             -- 'plan_generated' | 'plan_refined'
  severity          TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  related_event_row UUID REFERENCES ai_quality_events(id), -- links a rapid_correction back to the plan row it's reacting to
  raw_user_message  TEXT,                   -- the message/correction that triggered this, truncated
  error_detail      TEXT,                   -- exception message / parse error, if any
  model_used        TEXT,                   -- which Gemini model was in play, if known
  context           JSONB NOT NULL DEFAULT '{}', -- free-form extra detail (request payload snippet, mode, etc.)
  notified_at       TIMESTAMPTZ,            -- when (if) a Telegram alert was sent for this row
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_created ON ai_quality_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_event ON ai_quality_events(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_quality_events_unnotified ON ai_quality_events(created_at) WHERE notified_at IS NULL;

-- Monthly-gated CSAT score + freeform comment, kept separate from the
-- anytime "general feedback" flow (same table, distinguished by
-- response_type) so a quick satisfaction pulse doesn't get mixed up with
-- an urgent bug report that shouldn't wait for the next monthly prompt.
CREATE TABLE IF NOT EXISTS csat_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_type   TEXT NOT NULL DEFAULT 'csat', -- 'csat' | 'general_feedback'
  score           SMALLINT CHECK (score BETWEEN 1 AND 5), -- null for general_feedback
  feedback_text   TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  source_channel  TEXT NOT NULL DEFAULT 'web', -- 'web' | 'telegram' | 'whatsapp'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_csat_responses_user_recent ON csat_responses(user_id, created_at DESC);

-- Server-side Google OAuth refresh token for background sync ("Auto Sync
-- & Notify"). Distinct from the browser's short-lived implicit-flow
-- access token (sessionStorage, src/services/googleAuth.ts) - this is
-- the authorization-code flow's long-lived refresh token, needed so a
-- cron job with no browser open can call Google Calendar/Tasks on a
-- user's behalf. encrypted_refresh_token is AES-256-GCM ciphertext
-- (server/cryptoUtil.ts), never plain text - this is meaningfully more
-- sensitive than anything else stored in this schema (real, standing
-- access to someone's Google account). revoked_at is set the first time
-- a refresh attempt fails with invalid_grant (the user revoked access in
-- their own Google account settings) so the background job stops
-- retrying a dead token and can tell the user their sync broke.
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_refresh_token TEXT NOT NULL,
  scope                   TEXT,
  linked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at       TIMESTAMPTZ,
  revoked_at              TIMESTAMPTZ
);

-- When the daily background agenda scan (api/cron/[job].ts ->
-- server/backgroundAgendaScan.ts) last finished a pass for this user. Only
-- calendar events CREATED after this moment count as "new" on the next
-- pass, and it only advances after the Telegram message went out, so a
-- failed delivery is retried the next day instead of being lost.
-- server/backgroundAgendaScan.ts also runs this idempotent statement itself
-- (ensureBackgroundSyncSchema) so the feature works without a manual
-- `npm run db:migrate` against production.
ALTER TABLE google_oauth_tokens
  ADD COLUMN IF NOT EXISTS last_agenda_scan_at TIMESTAMPTZ,
  -- How the daily digest reaches this user: 'telegram' | 'email' | 'in_app'.
  -- NULL = automatic (Telegram if paired, otherwise the in-app notice).
  ADD COLUMN IF NOT EXISTS notify_channel TEXT;

-- Multi-device event sync + soft delete (server/eventSyncSchema.ts also
-- applies these idempotently at runtime). An event's public id everywhere is
-- client_id ?? id::text; deleted_at marks a soft delete (restorable from
-- Settings, purged by the daily cron after 30 days).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS client_id         TEXT,
  ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_payload    JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_client_id ON events(user_id, client_id) WHERE client_id IS NOT NULL;
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS client_id      TEXT,
  ADD COLUMN IF NOT EXISTS client_payload JSONB;
CREATE INDEX IF NOT EXISTS idx_milestones_event_client ON milestones(event_id, client_id);

-- Google ids of what the server-side background push created for an event
-- created over Telegram (server/googleBackgroundPush.ts). The web app reads
-- them back so it shows the event as already synced instead of pushing it a
-- second time.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS google_event_id     TEXT,
  ADD COLUMN IF NOT EXISTS google_event_link   TEXT,
  ADD COLUMN IF NOT EXISTS synced_to_google_at TIMESTAMPTZ;
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS google_task_id TEXT;

-- New calendar events the daily scan found, kept so the app can show them
-- as a notice when the user has no Telegram/email delivery (notified_via is
-- NULL until an external channel actually delivered them).
CREATE TABLE IF NOT EXISTS agenda_scan_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  event_date      TEXT NOT NULL,          -- YYYY-MM-DD
  prep_steps      INTEGER NOT NULL DEFAULT 0,
  found_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_via    TEXT,                   -- 'telegram' | 'email' | NULL
  dismissed_at    TIMESTAMPTZ,
  UNIQUE (user_id, google_event_id)
);

-- Per-user notification preference for Auto Sync & Notify. Lives here
-- (not localStorage, unlike every other preference in this codebase so
-- far) because a background cron has no browser to read from - only
-- Postgres. NULL columns fall back to the recommended defaults
-- ('telegram' if linked else 'email', 'daily', '08:00') applied in code,
-- not here, so the default can change without a migration.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_channel  TEXT,      -- 'telegram' | 'email' | 'none'
  ADD COLUMN IF NOT EXISTS notify_cadence  TEXT,      -- 'immediate' | 'daily' | 'weekly'
  ADD COLUMN IF NOT EXISTS notify_time     TEXT,      -- 'HH:MM' 24h, paired with notify_timezone
  ADD COLUMN IF NOT EXISTS notify_timezone TEXT;      -- IANA tz name, e.g. 'Europe/Brussels'

-- Queue of "a plan is ready" events awaiting delivery per the user's
-- cadence preference. 'immediate' cadence rows are inserted already
-- marked delivered (sent synchronously by the route that created them),
-- purely for a consistent audit trail matching ai_quality_events'
-- notified_at pattern; 'daily'/'weekly' rows sit here until the fan-out
-- cron (api/cron/notify-digest.ts) picks them up.
CREATE TABLE IF NOT EXISTS pending_plan_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ,
  channel_used  TEXT,
  UNIQUE (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_pending_plan_notifications_undelivered
  ON pending_plan_notifications(user_id) WHERE delivered_at IS NULL;
