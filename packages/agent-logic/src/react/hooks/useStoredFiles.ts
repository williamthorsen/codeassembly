import type { FileStore, StoredFileEntry } from '@williamthorsen/toolbelt.text-file-store/proposed';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How often the store is listed while the page is visible, in milliseconds. */
export const STORED_FILES_POLL_MS = 3000;

export interface StoredFiles {
  /** The store's files, in the order in which the store lists them. */
  files: StoredFileEntry[];
  /** Lists the store at once, such as after a write. */
  refresh: () => void;
}

/**
 * Keeps the list of the store's files current by listing it on mount, every `STORED_FILES_POLL_MS` while the page is
 * visible, when the page becomes visible, and on `refresh`. A listing that fails keeps the previous files, and one that
 * a newer listing has already replaced is dropped.
 */
export function useStoredFiles(store: FileStore): StoredFiles {
  const [files, setFiles] = useState<StoredFileEntry[]>([]);
  const requestCount = useRef(0);
  const appliedRequest = useRef(0);
  const isMounted = useRef(true);

  const refresh = useCallback(() => {
    requestCount.current += 1;
    const request = requestCount.current;
    async function listFiles(listedStore: FileStore): Promise<void> {
      let listed: StoredFileEntry[];
      try {
        listed = await listedStore.list();
      } catch {
        return;
      }
      if (!isMounted.current || request < appliedRequest.current) return;
      appliedRequest.current = request;
      // Keep the previous array for an unchanged listing, so that a poll does not re-render the page.
      setFiles((previous) => (isSameListing(previous, listed) ? previous : listed));
    }
    void listFiles(store);
  }, [store]);

  useEffect(() => {
    isMounted.current = true;
    refresh();
    function refreshIfVisible(): void {
      if (globalThis.document.visibilityState === 'visible') refresh();
    }
    const interval = setInterval(refreshIfVisible, STORED_FILES_POLL_MS);
    globalThis.document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
      globalThis.document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refresh]);

  return { files, refresh };
}

// region | Helpers
/** Reports whether two listings name the same files with the same modification times, in the same order. */
function isSameListing(a: StoredFileEntry[], b: StoredFileEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index];
      return entry.name === other?.name && entry.modifiedAt === other.modifiedAt;
    })
  );
}
// endregion | Helpers
