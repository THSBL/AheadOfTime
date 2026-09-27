# Owner to-do

Things only the owner can do (Vercel / Google / Telegram settings). Tick them off here.

## Check the cron secret (after the security deploy of 27 Sep 2026)

Why: the two daily/weekly jobs, and re-registering the Telegram bot, now **refuse to run without `CRON_SECRET`**. Before this deploy the weekly report ran without it.

- [ ] **Is `CRON_SECRET` set?** Vercel → your project → Settings → Environment Variables. Look for `CRON_SECRET` in **Production**.
  - If it's missing: add it with a long random value (any password generator, 32+ characters), Production only, then **Redeploy** (Deployments → latest → ⋯ → Redeploy). Vercel's own cron sends it automatically once it exists.
- [ ] **Do the crons run?** Vercel → your project → Settings → **Cron Jobs**. You should see:
  - `/api/cron/agenda-scan` — daily at 07:00 UTC
  - `/api/cron/weekly-report` — Mondays at 08:00 UTC

  Click **View logs** on each after its next run: a 200 is good; `401 Unauthorized` or `CRON_SECRET is not configured` means the secret is missing or wrong.
- [ ] **Optional dry run of the agenda scan** (sends nothing):
  `curl -H "Authorization: Bearer <CRON_SECRET>" "https://aheadoftime.app/api/cron/agenda-scan?dryRun=1"`
- [ ] **Telegram still answering?** Send the bot a message after the deploy. The first message makes the bot re-register itself with its new secret; the reply may take a retry (up to a minute). If it stays silent, re-register it:
  `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://aheadoftime.app/api/telegram/set-webhook`

## Other open items (from docs/security-review.md)

- [ ] Check the Gemini API project's billing tier (paid vs free): whether Google may use API data depends on it; make sure it matches the privacy page.
- [ ] Decide whether "Plan with AI" stays on by default or becomes opt-in.
