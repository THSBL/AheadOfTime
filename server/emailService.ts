/**
 * Minimal transactional email via Resend's HTTP API (no SDK dependency).
 *
 * Needs RESEND_API_KEY, and for real recipients EMAIL_FROM on a domain
 * verified in Resend (until then Resend only delivers to the account
 * owner's own address, from onboarding@resend.dev).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Ahead Of Time <onboarding@resend.dev>';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured.' };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('Resend rejected the email:', res.status, body.slice(0, 300));
      // Resend explains itself ("domain is not verified", "you can only send
      // testing emails to your own address"), and the owner testing the
      // feature needs to see that instead of a bare status code.
      let reason = '';
      try {
        reason = String(JSON.parse(body)?.message || '');
      } catch {
        // not JSON
      }
      return { ok: false, error: reason ? `Resend: ${reason}` : `Resend responded ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.warn('Resend request failed:', err);
    return { ok: false, error: err?.message || 'Email request failed' };
  }
}
