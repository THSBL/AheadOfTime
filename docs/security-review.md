# Security & privacy review — September 2026

Scope: every API route (Vercel functions in `api/` and their `server.ts` twins), every Postgres table, every Gemini prompt, and the Telegram bot.

## Fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical | The Gemini routes answered **anyone**: `/api/agent` (chat, questions, voice transcription), `/api/event/deep-refine`, `/api/milestone/suggest-timing`, `/api/presets`. The app's Gemini key was a free general-purpose AI for whoever found the URLs. | Sign-in required on all of them (`server/aiGuard.ts`), input size caps (413), per-user limit 60/hour and 300/day in Postgres (`ai_usage`, 429). Transcription (unused by the app) removed. |
| 2 | Critical | `/api/telegram/set-webhook` let anyone point the bot at **any URL**, redirecting every user's Telegram messages. | Owner only (`Authorization: Bearer $CRON_SECRET`), and always the app's own URL. |
| 3 | Critical | `/api/telegram/manual-link` (no sign-in) linked a pairing code to **the most recently active Telegram chat of any user**, so a click could connect an account to a stranger's chat. | Removed (410), including the app's "manual verify" fallback. |
| 4 | High | Telegram webhook accepted fake updates when `TELEGRAM_WEBHOOK_SECRET` wasn't set, so anyone could act as any chat. | A secret is always required: the configured one, else one derived from the bot token. A webhook registered without it re-registers itself once (production only); Telegram retries the rejected update, so nothing is lost. |
| 5 | High | Pairing codes: `Math.random`, and a code stayed usable after linking and after expiry, so anyone who later saw one could attach their chat to that account. | Cryptographic codes, single use, 24 h expiry enforced. |
| 6 | High | The Telegram bot gave **unlinked** chats full Gemini planning. | Gemini only for linked accounts with AI on, within the same limits; others get the built-in planner. |
| 7 | High | Prompt injection / off-topic use: free-text model fields could carry anything (essays, code), and Telegram prompts are plain text where a user could imitate the app's own `[System: …]` notes or the current time. | One scope rule in every prompt (web, import, Telegram, WhatsApp; user text, event titles and calendar entries are data, never instructions); off-topic requests get a fixed refusal instead of model text; free-text output trimmed to plan-sized lengths; spoofed system notes stripped. |
| 8 | Medium | `/api/cron/weekly-report` ran for anyone when `CRON_SECRET` was missing (it sends feedback quotes to the owner). | Fails closed, like the agenda scan. |
| 9 | Medium | `/api/quality/report-client-error` took unauthenticated writes, each one alerting the owner on Telegram. | Sign-in required. |
| 10 | Medium | No security headers. | Clickjacking protection (`X-Frame-Options`, `frame-ancestors`), `nosniff`, referrer policy, HSTS, camera/mic/location off, `no-store` on `/api/*` (`vercel.json`). |
| 11 | Privacy | No way to delete an account. | Settings → Credentials → Delete account (`DELETE /api/auth/account`): revokes the Google grant, deletes the user (every table cascades), clears the session. |
| 12 | Privacy | Users' raw messages kept indefinitely in `ai_quality_events`. | Cleared after 90 days (counts kept). |
| 13 | Privacy | Privacy page said all processing was "strictly deterministic and localized", yet calendar entries and chat text go to Gemini. | Corrected, with a section on what is sent to Gemini and the switch to turn it off. |
| 14 | Privacy / honesty | The chat's microphone button recorded audio, then submitted a hardcoded demo sentence. | Hidden until real transcription exists. |

## Checked and fine

- **SQL**: every query is parameterised; no user text is ever concatenated into SQL.
- **Ownership**: event sync, the single-event route, profile, AI setting and Background Sync routes all scope by the signed-in user; deep links need a signed, expiring token.
- **Secrets at rest**: Google refresh tokens are AES-encrypted (`TOKEN_ENCRYPTION_KEY`, required); session tokens are stored only as SHA-256 hashes; cookies are HttpOnly, Secure, SameSite=Lax.
- **OAuth**: `state` is HMAC-signed with a 10-minute expiry.
- **Deletion cascade**: all 12 tables referencing `users` delete with it (the calendar poll keeps anonymous answers; a deleted user's are removed explicitly).
- **CORS**: the two routes with `Access-Control-Allow-Origin: *` can't be used with the session cookie from another site (browsers don't send cookies to wildcard CORS), so they need a Google token the attacker doesn't have.

## Remaining (not fixed)

- **Content-Security-Policy** beyond `frame-ancestors`: needs testing against Google sign-in, analytics and fonts before it can be switched on.
- **Landing-page calendar poll** takes unauthenticated answers (validated and size-capped); someone could still post many fake answers. Add per-IP limiting if the numbers ever look off.
- **Gemini data terms**: whether Google may use API data depends on the Gemini API tier (paid vs free). Check the project's billing tier matches what the privacy page promises.

## Owner checklist

- `CRON_SECRET` must be set in Vercel (the cron jobs and set-webhook refuse to run without it).
- Optional: set `TELEGRAM_WEBHOOK_SECRET`; otherwise the derived one is used automatically. After this deploy, the first Telegram message re-registers the webhook with its secret by itself; if messages stop arriving, call `POST /api/telegram/set-webhook` with `Authorization: Bearer <CRON_SECRET>`.
