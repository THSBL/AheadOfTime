-- Ahead Of Time - report queries for the Neon SQL Editor (read-only).
-- Paste one query at a time. All times are UTC.
-- Personal data (emails, feedback text, raw messages) appears only where
-- noted; keep those results out of shared screenshots/exports.

-- 1. New users per week
SELECT date_trunc('week', created_at)::date AS week, COUNT(*) AS new_users
FROM users
GROUP BY 1 ORDER BY 1 DESC;

-- 2. Weekly active planners: users who created or updated an event that week
SELECT date_trunc('week', updated_at)::date AS week, COUNT(DISTINCT user_id) AS active_users
FROM events
WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 1 DESC;

-- 3. Events created per week, by channel (web / telegram / whatsapp)
SELECT date_trunc('week', created_at)::date AS week, source_channel, COUNT(*) AS events
FROM events
WHERE deleted_at IS NULL
GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC;

-- 4. What people plan: events by category
SELECT category, COUNT(*) AS events, COUNT(DISTINCT user_id) AS users
FROM events
WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;

-- 5. Do people actually do their prep? Task completion by category
SELECT e.category,
       COUNT(*) AS tasks,
       COUNT(*) FILTER (WHERE m.status = 'completed') AS completed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE m.status = 'completed') / NULLIF(COUNT(*), 0), 1) AS pct_completed
FROM milestones m
JOIN events e ON e.id = m.event_id
WHERE e.deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;

-- 6. AI health per day: how often Gemini failed and the app fell back
SELECT date_trunc('day', created_at)::date AS day, signal_type, source_channel, COUNT(*) AS n
FROM ai_quality_events
WHERE created_at > now() - interval '30 days'
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 4 DESC;

-- 6b. The actual Gemini errors behind those fallbacks (latest 50)
SELECT created_at, source_channel, signal_type, error_detail
FROM ai_quality_events
WHERE signal_type IN ('gemini_error', 'gemini_fallback')
ORDER BY created_at DESC LIMIT 50;

-- 7. Satisfaction (CSAT 1-5) per month
SELECT date_trunc('month', created_at)::date AS month,
       COUNT(*) AS ratings, ROUND(AVG(score), 2) AS avg_score
FROM csat_responses
WHERE response_type = 'csat'
GROUP BY 1 ORDER BY 1 DESC;

-- 7b. Latest written feedback (contains personal data)
SELECT c.created_at, u.email, c.response_type, c.score, c.tags, c.feedback_text
FROM csat_responses c JOIN users u ON u.id = c.user_id
ORDER BY c.created_at DESC LIMIT 50;

-- 8. "Which calendar do you use?" - one row per person (latest answer anywhere)
SELECT calendar, COUNT(*) AS people, COUNT(notify_email) AS left_email,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM (
  SELECT DISTINCT ON (visitor_id) visitor_id, calendar, notify_email
  FROM calendar_preference_votes ORDER BY visitor_id, updated_at DESC
) latest
GROUP BY 1 ORDER BY 2 DESC;

-- 8b. Same, split by where it was asked (landing / onboarding / feedback)
SELECT source, calendar, COUNT(*) AS answers
FROM calendar_preference_votes
GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- 8c. Emails to notify per calendar (contains personal data)
SELECT calendar, notify_email, updated_at
FROM calendar_preference_votes
WHERE notify_email IS NOT NULL
ORDER BY calendar, updated_at DESC;

-- 9. Feature adoption: Background Sync and Telegram/WhatsApp linking
SELECT 'background_sync' AS feature, COUNT(*) AS users
FROM google_oauth_tokens WHERE revoked_at IS NULL
UNION ALL
SELECT 'linked_' || channel, COUNT(DISTINCT user_id)
FROM integration_accounts WHERE is_linked GROUP BY channel;

-- 10. Onboarding profile mix (stored per account from this release on;
--     answers given before it exist only in each user's browser until they
--     next open the app signed in, when they're uploaded automatically)
SELECT family_structure, has_pet, primary_calendar, COUNT(*) AS users
FROM user_profiles
GROUP BY 1, 2, 3 ORDER BY 4 DESC;
