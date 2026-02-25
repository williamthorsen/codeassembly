import { useEffect, useRef, useState } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { fetchRunStatus } from '../api/client.js';

interface UseRunStatusResult {
  data: CanonicalRunStatus | null;
  isLoading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 2000;

export function useRunStatus(projectSlug: string | null, runId: string | null): UseRunStatusResult {
  const [data, setData] = useState<CanonicalRunStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectSlug || !runId) {
      setData(null);
      return;
    }

    // Reset stale state from previous run selection
    setData(null);
    setError(null);

    let mounted = true;
    // Capture narrowed non-null values for use inside the async closure
    const slug = projectSlug;
    const id = runId;

    async function loadStatus() {
      try {
        const status = await fetchRunStatus(slug, id);
        if (mounted) {
          setData(status);
          setError(null);

          if (status.status === 'in_progress' && intervalRef.current === null) {
            intervalRef.current = setInterval(() => {
              void loadStatus();
            }, POLL_INTERVAL_MS);
          } else if (status.status !== 'in_progress' && intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error_) {
        if (mounted) {
          setError(error_ instanceof Error ? error_ : new Error('Unknown error'));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    void loadStatus();

    return () => {
      mounted = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [projectSlug, runId]);

  return { data, isLoading, error };
}
