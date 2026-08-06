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
    async function loadDismissed(): Promise<void> {
      try {
        const settings = await fetchSettings();
        setDismissed(settings.dismissedRuns);
      } catch (error: unknown) {
        console.warn('Failed to load settings, continuing with empty state:', error);
      }
    }

    void loadDismissed();
  }, []);

  const dismiss = useCallback((key: string, status: string): void => {
    const prev = dismissedRef.current;
    if (prev[key]?.status === status) return;

    const next = { ...prev, [key]: { status } };
    setDismissed(next);
    void persistDismissed(next);
  }, []);

  const dismissAll = useCallback((entries: { key: string; status: string }[]): void => {
    if (entries.length === 0) return;

    const prev = dismissedRef.current;
    let changed = false;
    const next = { ...prev };
    for (const { key, status } of entries) {
      if (next[key]?.status === status) {
        continue;
      }

      next[key] = { status };
      changed = true;
    }
    if (!changed) return;

    setDismissed(next);
    void persistDismissed(next);
  }, []);

  return { dismissed, dismiss, dismissAll };
}

// region | Helpers

/** Persists the dismissed-run record, warning rather than throwing when the request fails. */
async function persistDismissed(next: Record<string, DismissedRunEntry>): Promise<void> {
  try {
    await patchSettings({ dismissedRuns: next });
  } catch (error: unknown) {
    console.warn('Failed to persist dismissed runs:', error);
  }
}

// endregion | Helpers
