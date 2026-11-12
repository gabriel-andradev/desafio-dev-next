'use client';

import { useEffect, useState } from 'react';
import { ActionState } from '@/types/wallet';

/**
 * One idempotency key per logical operation: it stays the same across retries and double submits
 * of the same form, and is replaced only after the operation succeeds.
 * Generated after mount so the server-rendered HTML and the client agree (no hydration mismatch).
 */
export function useIdempotencyKey(state: ActionState): string {
  const [key, setKey] = useState('');

  useEffect(() => {
    if (!key || state.success) {
      setKey(crypto.randomUUID());
    }
    // Only a new action result (or the first mount) should rotate the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return key;
}
