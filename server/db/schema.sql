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
