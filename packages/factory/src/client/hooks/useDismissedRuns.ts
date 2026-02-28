import { useCallback, useEffect, useRef, useState } from 'react';

import type { DismissedRunEntry } from '../../shared/types/settings.js';
import { fetchSettings, patchSettings } from '../api/client.js';

interface UseDismissedRunsResult {
  dismissed: Readonly<Record<string, DismissedRunEntry>>;
  dismiss: (key: string, status: string) => void;
  dismissAll: (entries: { key: string; status: string }[]) => void;
}

/** Manages server-persisted dismissed run state with optimistic updates. */
export function useDismissedRuns(): UseDismissedRunsResult {
  const [dismissed, setDismissed] = useState<Record<string, DismissedRunEntry>>({});
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;

  useEffect(() => {
    fetchSettings()
      .then((settings) => setDismissed(settings.dismissedRuns))
      .catch((error: unknown) => {
        console.warn('Failed to load settings, continuing with empty state:', error);
      });
  }, []);

  const dismiss = useCallback((key: string, status: string): void => {
    const prev = dismissedRef.current;
    if (prev[key]?.status === status) return;

    const next = { ...prev, [key]: { status } };
    setDismissed(next);
    patchSettings({ dismissedRuns: next }).catch((error: unknown) => {
      console.warn('Failed to persist dismissal:', error);
    });
  }, []);

  const dismissAll = useCallback((entries: { key: string; status: string }[]): void => {
    if (entries.length === 0) return;

    const prev = dismissedRef.current;
    let changed = false;
    const next = { ...prev };
    for (const { key, status } of entries) {
      if (next[key]?.status !== status) {
        next[key] = { status };
        changed = true;
      }
    }
    if (!changed) return;

    setDismissed(next);
    patchSettings({ dismissedRuns: next }).catch((error: unknown) => {
      console.warn('Failed to persist dismissals:', error);
    });
  }, []);

  return { dismissed, dismiss, dismissAll };
}
