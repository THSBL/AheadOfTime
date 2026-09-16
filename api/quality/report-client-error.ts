import { logQualityEvent, QualitySignalType } from '../../server/qualityStore.js';

const ALLOWED_SIGNAL_TYPES: QualitySignalType[] = ['explicit_failure_reply', 'gemini_error'];

/**
 * Relays a client-side "the app just told the user it failed" moment into
 * the same ai_quality_events table server-side code writes to - the
 * browser can't reach Postgres directly. Pure logging: this route never
 * changes anything the client is doing, it only records that a failure
 * happened. No auth required (a failure report from a logged-out session
 * is still useful), but the signal_type is restricted to a small allowlist
 * so this can't be used to write arbitrary rows.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { signalType, errorDetail, rawUserMessage, eventId } = req.body || {};
    const safeSignalType: QualitySignalType = ALLOWED_SIGNAL_TYPES.includes(signalType)
      ? signalType
      : 'explicit_failure_reply';

    await logQualityEvent({
      sourceChannel: 'web',
      signalType: safeSignalType,
      severity: 'high',
      errorDetail: typeof errorDetail === 'string' ? errorDetail : undefined,
      rawUserMessage: typeof rawUserMessage === 'string' ? rawUserMessage : undefined,
      // Only a genuine Postgres UUID (a Telegram-store-backed event) is
      // usable here - client-side-only events use non-UUID ids that would
      // fail the column's foreign key.
      eventId: typeof eventId === 'string' && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : undefined,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Logging failures should never surface to the client.
    console.warn('report-client-error handler notice:', err);
    return res.status(200).json({ ok: false });
  }
}
