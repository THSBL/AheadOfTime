import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './emailLogin';

describe('email sign-in', () => {
  it('accepts and normalises real addresses only', () => {
    expect(normalizeEmail('  Apple.User@Example.com ')).toBe('apple.user@example.com');
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
