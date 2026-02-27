import { useCallback, useState } from 'react';

interface UseDismissedRunsResult {
  dismissed: ReadonlySet<string>;
  dismiss: (key: string) => void;
  dismissAll: (keys: string[]) => void;
}

/** Manages session-scoped dismissed run state. Keys use the format "projectSlug/ticketId/runId". */
export function useDismissedRuns(): UseDismissedRunsResult {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const dismiss = useCallback((key: string): void => {
    setDismissed((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const dismissAll = useCallback((keys: string[]): void => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        next.add(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, []);

  return { dismissed, dismiss, dismissAll };
}
