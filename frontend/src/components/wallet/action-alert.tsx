import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ActionState } from '@/types/wallet';

/**
 * Renders the success/error feedback returned by a wallet Server Action.
 */
export function ActionAlert({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      role="alert"
      className={`flex items-center gap-2.5 p-3.5 rounded-lg border text-xs sm:text-sm ${
        state.success
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-rose-50 border-rose-200 text-rose-800'
      }`}
    >
      {state.success ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
      )}
      <span>{state.message}</span>
    </div>
  );
}
