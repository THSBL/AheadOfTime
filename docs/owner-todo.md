# Owner to-do

Things only the owner can do (Vercel / Google / Telegram settings). Tick them off here.

## Check the cron secret (after the security deploy of 27 Sep 2026)

Why: the two daily/weekly jobs, and re-registering the Telegram bot, now **refuse to run without `CRON_SECRET`**. Before this deploy the weekly report ran without it.

- [x] **Is `CRON_SECRET` set?** (confirmed 28 Sep 2026) Vercel → your project → Settings → Environment Variables. Look for `CRON_SECRET` in **Production**.
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

## Ads on public pages (Google AdSense) - added 7 Oct 2026

The app shows one ad block on two public pages only: a shared plan (`/p/...`) and the try-out chat (`/try`, for visitors who aren't signed in). Nothing shows until these steps are done. Ads are non-personalised; the privacy policy already says so.

- [x] **AdSense account** with publisher id `ca-pub-3080738656559449` (in the code; nothing to set in Vercel).
- [ ] **Verify the site** in AdSense (Sites → aheadoftime.app): choose **Meta tag** or **Ads.txt snippet**. Both are already on the live site. Don't add the script snippet to the site; it isn't needed.
- [ ] **EU consent message:** Privacy & messaging → European regulations → create and publish the consent message for aheadoftime.app. Google requires it for visitors from the EU, UK and Switzerland.
- [x] **Two ad units created:** Shared plan `7879371811`, Try-out chat `7767691179` (in the code). Was: Ads → By ad unit → Display ads. Name one "Shared plan" and one "Try-out chat", keep them Responsive, and save. Each gets a code with `data-ad-slot="1234567890"`: that number is the unit's id. Send both numbers, or add them in Vercel as `VITE_ADSENSE_SLOT_SHARED_PLAN` and `VITE_ADSENSE_SLOT_TRY_CHAT` and redeploy.
- [ ] After the redeploy, open a shared plan and check the ad block appears (an ad blocker hides it).

## Weekly "T-minus Tuesday" content package - added 7 Oct 2026

Every Monday (with the weekly report), the app builds one example plan for one of the four target groups, publishes it as a shared plan, and writes a Reddit, LinkedIn and Pinterest draft. You review and post by hand: nothing is posted automatically.

- [ ] **Email:** goes to `OWNER_EMAIL` if set, otherwise the first address in `ADMIN_EMAILS`. Set `OWNER_EMAIL` in Vercel if that's not the address you want.
- [ ] **Telegram:** goes to `OWNER_TELEGRAM_CHAT_ID` (already used by the weekly report).
- [ ] **Preview any time** (publishes and sends nothing):
  `curl -H "Authorization: Bearer <CRON_SECRET>" "https://aheadoftime.app/api/cron/weekly-content?dryRun=1"`
  Without `?dryRun=1` it publishes this week's example plan and sends the package right away.

## Weekly blog conversation "T-minus Talks" - added 8 Oct 2026

**Update (8 Oct): short posts, from real questions.** On /admin/blog, paste a
question someone asked on Reddit or a forum (+ the thread link, only for you)
and tap *Write a post about this*. It's retold in our own words with names,
places and details changed (usernames, e-mails and links are stripped before
anything else sees it), run through the real app, and written up as a short
post: the situation, the plan, the 3 lead times that matter, one thing the app
couldn't do. The review page and email include a **draft reply for the thread**:
post it yourself, as yourself, once the post is live and only where the
subreddit allows links. Never automate this. Without a question, the weekly
run writes a short post with an invented guest instead.

Every week a fictional guest (an AI persona with a job, city, household,
calendar and one complication) uses the real app: types a request, answers
the app's follow-up questions, gets the real plan. Then the host (Tess) and
the guest talk it through, one turn per AI call, and an editor pass writes
the post. Code: `server/blogEpisodes.ts`, guests: `server/blogPersonas.ts`.

- **Nothing to set up**: it uses `GEMINI_API_KEY`, `NOTIFY_LINK_SECRET`
  (review links), and the same owner email / `OWNER_TELEGRAM_CHAT_ID` as the
  weekly content. Without the AI key it does nothing (no template posts).
- **When**: the daily cron (07:00 UTC) starts the week's episode on Monday
  and carries it on with the time it has left; usually ready in 1-3 days.
- **You get**: an email + Telegram message with a review link. The draft
  shows exactly as it will look, plus the guest's *product notes* (their
  criticism of the app - never published). Tap **Publish** or **Skip**.
  A published post can be unpublished from the same link (valid 60 days).
- **Your note + "Reviewed by"**: the review page has a box for a few sentences
  of your own (shown under the plan as "A note from <you>") and your name +
  one line about you (shown under the title, and to Google as the post's
  editor). Name and line are remembered for next week. This human part is
  what makes the posts more than AI text - worth the two minutes.
- **Admin page: https://aheadoftime.app/admin/blog** (signed in with an
  ADMIN_EMAILS account): every conversation with its status, an **Edit**
  button (the review page) and **Write a new one now** (keeps the page busy
  1-4 minutes until it's ready for review).
- **Or from a terminal** (each run has ~50 s; repeat until it says "ready for review"):
  `curl -H "Authorization: Bearer $CRON_SECRET" "https://aheadoftime.app/api/cron/blog-episode"`
  Add `?new=1` to start an extra episode this week.
- **Pages**: `/blog`, `/blog/<post>`, RSS at `/blog/feed.xml`, sitemap at
  `/blog-sitemap.xml` (listed in robots.txt). Submit the sitemap in Google
  Search Console once the first post is live.
- Every post says the guest is an AI persona. Keep it that way: without it
  the posts read as fake testimonials.

## Plan lessons (learning from feedback) - added 8 Oct 2026

**https://aheadoftime.app/admin/lessons** (signed in with an ADMIN_EMAILS account).
Once a week the daily job looks at what users told us - feedback-form text,
corrections typed in the chat, steps several people skip, blog product notes -
and proposes at most 6 rules. Each rule only **adds, leaves out or moves one
step** for one kind of event (for "Other" also only when the event title has
certain words, e.g. "move"). Approve (edit first if needed), Reject, or later
**Stop using**. "Look for new lessons now" runs it on demand.

Safety: rules are applied by the app's code to new plans after the AI has
answered - they are never sent to the AI, so they can't instruct it. Step
titles are checked (short plain words; no links, addresses, numbers or
instruction words) when proposed, when you approve, and every time a rule is
used. Only signed-in accounts at least a week old, with a plan of their own and
AI planning on, count (max 3 signals per person per round; guests and the
try-out never); events imported from Google Calendar never do; e-mails, links and phone numbers are removed first. At most
30 rules in use, at most 3 per plan. Code: server/planLessons.ts (rules),
server/lessonsStore.ts (signals, proposals, admin).
