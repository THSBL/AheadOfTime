import crypto from 'crypto';

/**
 * AES-256-GCM encryption for secrets that must be stored at rest (today:
 * only the Google OAuth refresh token in google_oauth_tokens - the one
 * genuinely long-lived, standing-access secret this codebase persists).
 * Everything else stored in Postgres so far (Telegram chat ids, event
 * text) isn't sensitive enough to warrant this; a refresh token is real,
 * durable access to someone's Google account, so it never touches the
 * database as plain text.
 *
 * TOKEN_ENCRYPTION_KEY must be a 32-byte key, base64-encoded (e.g.
 * generate one with `openssl rand -base64 32`). Output format is
 * `iv:authTag:ciphertext`, each hex-encoded, so it's storable in a plain
 * TEXT column without further escaping.
 */

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured in environment.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (generate with `openssl rand -base64 32`).');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted value - expected "iv:authTag:ciphertext".');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
