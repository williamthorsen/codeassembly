import { useCallback, useEffect, useState } from 'react';

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

  useEffect(() => {
    fetchSettings()
      .then((settings) => {
        setDismissed(settings.dismissedRuns);
      })
      .catch(() => {
        // Graceful degradation: leave dismissed as empty on fetch failure
      });
  }, []);

  const dismiss = useCallback((key: string, status: string): void => {
    setDismissed((prev) => {
      const next = { ...prev, [key]: { status } };
      patchSettings({ dismissedRuns: next }).catch(() => {
        // Fire-and-forget: persist failure does not revert optimistic update
      });
      return next;
    });
  }, []);

  const dismissAll = useCallback((entries: { key: string; status: string }[]): void => {
    if (entries.length === 0) return;
    setDismissed((prev) => {
      const next = { ...prev };
      for (const { key, status } of entries) {
        next[key] = { status };
      }
      patchSettings({ dismissedRuns: next }).catch(() => {
        // Fire-and-forget: persist failure does not revert optimistic update
      });
      return next;
    });
  }, []);

  return { dismissed, dismiss, dismissAll };
}
