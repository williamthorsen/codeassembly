import { useEffect, useState } from 'react';

import type { PromptEntry } from '../../server/prompt-directory-schemas.ts';
import type { ConversionClient } from './conversion-client.ts';
import { POLL_INTERVAL_MS } from './useConversion.ts';

/**
 * The prompts directory as the page shows it: `hidden` until the server first answers and whenever it does not serve
 * the directory or cannot be reached, `ready` with its entries, `missing` when the directory does not exist, and
 * `malformed` when the config file that names it cannot be used.
 */
export type PromptDirectoryState =
  | { state: 'hidden' }
  | { state: 'ready'; directory: string; configPath: string; entries: PromptEntry[] }
  | { state: 'missing'; directory: string; configPath: string }
  | { state: 'malformed' };

/**
 * Polls the prompts directory every `POLL_INTERVAL_MS`, so that a file saved there appears without a reload. A server
 * that does not serve the directory stops the polling; one that cannot be reached does not, so that a restarted dev
 * server shows the directory again.
 */
export function usePromptDirectory(client: ConversionClient): PromptDirectoryState {
  const [directory, setDirectory] = useState<PromptDirectoryState>({ state: 'hidden' });

  useEffect(() => {
    let isCurrent = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void poll();
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };

    async function poll(): Promise<void> {
      const outcome = await client.listPrompts();
      if (!isCurrent) return;
      if (outcome.ok) {
        const { list } = outcome;
        const { directory, configPath } = list;
        if ('entries' in list) setDirectory({ state: 'ready', directory, configPath, entries: list.entries });
        else setDirectory({ state: 'missing', directory, configPath });
      } else {
        setDirectory({ state: outcome.reason === 'malformed' ? 'malformed' : 'hidden' });
        if (outcome.reason === 'absent') return;
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }
  }, [client]);

  return directory;
}
