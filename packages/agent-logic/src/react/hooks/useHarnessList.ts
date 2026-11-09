import type { HarnessList } from '@williamthorsen/telefactor/client';
import { useEffect, useState } from 'react';

import type { Problem } from '../../schema/validate-config.ts';
import type { ConversionClient } from './conversion-client.ts';

/** The harnesses that the server offers, without the problems that a malformed config file reports instead. */
export type HarnessOffer = Extract<HarnessList, { harnesses: unknown }>;

/**
 * The harness listing: `loading` until the server answers, `ready` with the harnesses, `malformed` with the problems of
 * a config file that the server cannot use, or `unreachable` with the problems that kept the page from reading it.
 */
export type HarnessListing =
  | { state: 'loading' }
  | { state: 'ready'; list: HarnessOffer }
  | { state: 'malformed'; configPath: string; problems: Problem[] }
  | { state: 'unreachable'; problems: Problem[] };

/** Reads the server's harnesses once, when the component mounts. */
export function useHarnessList(client: ConversionClient): HarnessListing {
  const [listing, setListing] = useState<HarnessListing>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    async function load(): Promise<void> {
      const outcome = await client.listHarnesses();
      if (!isCurrent) return;
      if (!outcome.ok) setListing({ state: 'unreachable', problems: outcome.problems });
      else if ('problems' in outcome.list) {
        setListing({ state: 'malformed', configPath: outcome.list.configPath, problems: outcome.list.problems });
      } else setListing({ state: 'ready', list: outcome.list });
    }
    void load();
    return () => {
      isCurrent = false;
    };
  }, [client]);

  return listing;
}
