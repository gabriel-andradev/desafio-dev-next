'use client';

import { useEffect, useState } from 'react';
import { ActionState } from '@/types/wallet';

/**
 * One idempotency key per logical operation: it stays the same across retries and double submits
 * of the same form, and is replaced only after the operation succeeds.
 * Generated after mount so the server-rendered HTML and the client agree (no hydration mismatch).
 * Only the first mount or a new action result can rotate it.
 */
export function useIdempotencyKey(state: ActionState): string {
  const [key, setKey] = useState('');

  useEffect(() => {
    setKey((current) =>
      !current || state.success ? crypto.randomUUID() : current,
    );
  }, [state]);

  return key;
}
