# Outlook integration plan

Status: draft for decision · Branch: `claude/ahead-of-time-deployment-api-7wf5ai` · Nothing in this plan is on `main`.

## 1. Where we are today

| Area | How it works now | Consequence for Outlook |
|---|---|---|
| **App login** | Google Identity Services in the browser. 34 server routes identify the user by verifying that Google access token (`server/googleAuthVerify.ts`). | Microsoft cannot be a *login* without replacing this with an app-owned session. Outlook as an *extra calendar* for a Google-signed-in user needs no login change. |
| **In-app calendar actions** (Push to Cal, Scan agenda, delete) | Browser calls Google Calendar / Google Tasks directly with the user's access token (`src/services/googleCalendar.ts`, `googleTasks.ts`, `GoogleCalendarSync.tsx`). | Needs an Outlook equivalent. |
| **Background Sync** (daily agenda scan, auto-push from Telegram) | Server-side OAuth: refresh token stored encrypted in `google_oauth_tokens`, used by the daily cron (`server/backgroundAgendaScan.ts`, `googleBackgroundPush.ts`). | Needs an Outlook refresh token stored the same way. |
| **Serverless functions** | **11 of 12** (Hobby plan cap). A merge of the Google auth routes into one catch-all `api/auth/[...path].ts` (10 of 12) was built in commit `1d3e52a` but **reverted**: a repo comment reports Vercel not routing two-segment paths into a catch-all, and it could not be verified on a preview while preview deploys fail on Neon provisioning. | Redo the merge as Phase 0 once previews work, and verify it there (see Phase 0). |

Google's OAuth project is **MyCalendarSync** (`mycalendarsync-507311`, project number 705347156449). Nothing in this plan changes it.

## 2. Decisions needed from you

1. **Scope of the first release.** *Recommendation:* Outlook as an **additional calendar** for users who sign in with Google (Phases 1–5). Microsoft as a **login method** is a separate, larger project (Phase 6) because every API route currently trusts a Google token.
2. **Which accounts.** *Recommendation:* "Any organizational directory **and** personal Microsoft accounts". Personal accounts (outlook.com, hotmail.com, live.com) work straight away. **Work/school accounts** in many organisations can't consent to an *unverified* multi-tenant app that asks for calendar access; their admin must approve it, or the app needs **publisher verification** (requires a free Microsoft AI Cloud Partner Program ID). Plan: launch for personal accounts, and verify before promoting to businesses.
3. **Where milestones go in Outlook.** Mirror the Google setting: as calendar entries, or as **Microsoft To Do** tasks (in their own "Ahead of Time" list). *Recommendation:* support both, same as the existing Google sync-format setting.
4. **Users with both calendars connected.** *Recommendation:* a per-user "Push plans to: Google / Outlook / both" setting, defaulting to the calendar they connected first. Background scans read both.

## 3. Architecture

### 3.1 OAuth: server-side, one consent
- **Flow:** OAuth 2.0 authorization code flow as a **confidential web app** (client secret, plus PKCE), tenant `common`.
- **Why not MSAL in the browser:** browser (SPA) refresh tokens expire after **24 hours**. Server-side refresh tokens last **90 days, renewed on every use**, which is what Background Sync needs. One server-side flow also means one consent screen and one token store.
- **Scopes (delegated):** `openid email profile offline_access User.Read Calendars.ReadWrite Tasks.ReadWrite`. `offline_access` is what makes Microsoft return a refresh token.
- **Linking to the user:** reuse `signOAuthState()` / `verifyOAuthState()`. The authorize call requires the verified Google session; the signed `state` ties the Microsoft callback to that user, exactly like Google Background Sync today.
- **Token rotation:** Microsoft may return a new refresh token on each refresh. Always store the newest one.
- **Routes** (in the merged `api/auth/[...path].ts` from Phase 0, add `microsoft` to `server/authRouting.ts`):
  - `GET /api/auth/microsoft/authorize` → returns the Microsoft consent URL
  - `GET /api/auth/microsoft/callback` → exchanges the code, stores the refresh token, redirects to Settings
  - `GET|DELETE /api/auth/microsoft/status` → connected? / disconnect (revoke + delete the token)

### 3.2 Calendar operations: server-side through Microsoft Graph
- All Outlook calls go through the server (the browser never holds a Microsoft token).
- **One new provider-neutral function** `api/calendar/[...path].ts` for push / list / delete, which Google can later share. **Brings the count to 11 of 12.**
- **Graph endpoints:**
  - Events: `POST/PATCH/DELETE /me/events`
  - Read a date range: `GET /me/calendarView?startDateTime=…&endDateTime=…`, which expands recurring events
  - Time zones: send the `Prefer: outlook.timezone="…"` header; all-day events need date-only start and end in the same time zone
  - Tasks: `GET/POST /me/todo/lists`, then `POST /me/todo/lists/{id}/tasks`
  - Throttling: honour `429` with `Retry-After`

### 3.3 Provider abstraction (done first, no behaviour change)
A `CalendarProvider` interface (`listEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `createTask`, `completeTask`, `deleteTask`):
- `GoogleCalendarProvider` wraps today's code as-is.
- `OutlookCalendarProvider` implements it with Graph.

Events keep per-provider references, e.g. `externalRefs.outlook = { eventId, taskIds, milestoneEventIds }`, next to today's Google ids, so pushes, updates and deletes stay idempotent per provider.

### 3.4 Storage
New table, encrypted with the existing `server/cryptoUtil.ts` / `TOKEN_ENCRYPTION_KEY`:

```sql
CREATE TABLE IF NOT EXISTS calendar_connections (
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL,          -- 'microsoft' (later also 'google')
  account_email           TEXT,                   -- the Microsoft account connected
  tenant_id               TEXT,                   -- personal vs organisation, for support
  encrypted_refresh_token TEXT NOT NULL,
  scope                   TEXT,
  linked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at       TIMESTAMPTZ,
  revoked_at              TIMESTAMPTZ,
  last_agenda_scan_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, provider)
);
```
`google_oauth_tokens` stays untouched; moving Google into this table is optional later cleanup.

## 4. One-time setup (you, in Microsoft Entra, about 20 minutes)
1. **entra.microsoft.com → App registrations → New registration.**
   - Name: *Ahead of Time*
   - Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*
   - Redirect URI, platform **Web**: `https://aheadoftime.app/api/auth/microsoft/callback`
2. **Certificates & secrets → New client secret.** The maximum lifetime is 24 months, so put a renewal reminder in your calendar. An expired secret breaks every Outlook connection.
3. **API permissions → Microsoft Graph → Delegated:** `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Calendars.ReadWrite`, `Tasks.ReadWrite`.
4. **Branding & properties:** publisher domain `aheadoftime.app`, logo, links to `/privacy` and the terms. These show on the consent screen.
5. **Vercel env vars** (Production + Preview + Development): `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT=common`.
6. **Later, before targeting businesses:** publisher verification (Partner Program ID).

*Preview deployments:* Entra doesn't accept wildcard redirect URIs. Test sign-in on production, or on one fixed preview domain added as an extra redirect URI.

## 5. Phases

Each phase ships on the branch with tests and a preview first, then goes to `main` only with your approval.

| # | Phase | What it delivers | Size |
|---|---|---|---|
| 0 | Function merge (redo) | Google auth in one catch-all; 10/12 functions; public URLs unchanged. Re-apply `1d3e52a`, then on a preview check: `/api/auth/google/status` → 401 JSON (not 404), `/api/auth/google/callback?error=access_denied` → redirect to `/settings/credentials?background_sync=declined`. If two-segment routing fails, use rewrites to one segment instead. | S |
| 1 | Provider abstraction | `CalendarProvider` interface; Google wrapped as-is; `externalRefs` per provider. No visible change. | M |
| 2 | Microsoft sign-in | Authorize / callback / status / disconnect; `calendar_connections`; token refresh + rotation; "Connect Outlook" card in Settings with clear errors (declined, work account needs admin approval, expired) | M |
| 3 | Push plans to Outlook | `api/calendar/[...path].ts`; event + milestones to Outlook Calendar, or milestones to To Do; update and delete; "Push to" choice | L |
| 4 | Read Outlook | Scan agenda and the daily background scan read Outlook (`calendarView`) as well as Google | M |
| 5 | Background & Telegram | Auto-push and Telegram-created plans go to the user's chosen calendar(s) | M |
| 6 | *(optional)* Microsoft login | The app-owned session now exists (`server/sessionStore.ts`, `/api/auth/session`; every route identifies users via `verifyRequestUser`). Microsoft login only needs a Microsoft sign-in path that calls `createSession`, plus users whose email comes from Microsoft | M |
| 7 | Hardening | Publisher verification, secret-expiry reminder, reconnect flow after revocation (password change, admin removal), delete Microsoft data on disconnect, privacy-policy update | S–M |

## 6. Risks and how they're handled
- **Work accounts blocked at consent:** clear message plus "ask your IT admin" guidance; publisher verification in Phase 7.
- **Client secret expires (≤ 24 months):** reminder, plus a status check that warns the owner before expiry.
- **Refresh token revoked or expired** (90 days unused, password reset, admin action): status shows "Reconnect Outlook"; background jobs skip that user and log it, same as Google today.
- **Time zones and all-day events:** explicit time-zone header and date-only all-day events; tests for DST boundaries.
- **Duplicates when both calendars are connected:** per-provider `externalRefs`, so each provider is pushed at most once per item.
- **Function cap:** 11 of 12 after Phase 3. Further consolidation is available if needed (`telegram/event/[id]` into `telegram/[...path]`, `quality` into `feedback`).
- **Google side unaffected:** Google's OAuth client, consent screen and verification don't change.

## 7. References
- Microsoft identity platform: refresh tokens (24 h SPA, 90 days otherwise): https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
- Publisher verification and consent for unverified multi-tenant apps: https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview
- Consent experience: https://learn.microsoft.com/en-us/entra/identity-platform/application-consent-experience
- Microsoft To Do API (personal and work accounts): https://learn.microsoft.com/en-us/graph/api/resources/todo-overview?view=graph-rest-1.0
- Create a To Do task: https://learn.microsoft.com/en-us/graph/api/todotasklist-post-tasks?view=graph-rest-1.0
