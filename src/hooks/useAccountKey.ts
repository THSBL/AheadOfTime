import { useEffect, useState } from 'react';
import { getCurrentUser, normalizeUserId } from '../services/accountManager';

/**
 * The signed-in account's id, updated when the account is switched in
 * place. Used as a React `key` so cards that loaded one account's data
 * start over for the next account instead of still showing the old one.
 */
export function useAccountKey(): string {
  const [key, setKey] = useState(() => normalizeUserId(getCurrentUser()?.id));
  useEffect(() => {
    const update = () => setKey(normalizeUserId(getCurrentUser()?.id));
    window.addEventListener('aot_account_switched', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('aot_account_switched', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return key;
}
