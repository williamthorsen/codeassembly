import type { ConversionState } from '../conversion-protocol/conversion-schemas.ts';
import type { ConversionStore } from './conversion-store.ts';

/** How long the store keeps an ended conversion by default: one hour. */
const DEFAULT_RETENTION_MS = 60 * 60 * 1000;

export interface MemoryConversionStoreOptions {
  /** How long the store keeps a conversion after it ends; one hour by default. */
  readonly retentionMs?: number;
  /** Returns the current time in milliseconds; `Date.now` by default. */
  readonly now?: () => number;
}

/**
 * Creates a store that keeps conversions in this process's memory and drops each ended one once its retention period
 * has passed, which every access checks.
 */
export function createMemoryConversionStore({
  retentionMs = DEFAULT_RETENTION_MS,
  now = Date.now,
}: MemoryConversionStoreOptions = {}): ConversionStore {
  const entries = new Map<string, { state: ConversionState; endedAt: number | undefined }>();

  /** Drops every ended conversion whose retention period has passed. */
  function sweep(): void {
    const cutoff = now() - retentionMs;
    for (const [id, { endedAt }] of entries) {
      if (endedAt !== undefined && endedAt <= cutoff) entries.delete(id);
    }
  }

  return {
    create(state) {
      sweep();
      entries.set(state.id, { state, endedAt: state.status === 'running' ? undefined : now() });
      return Promise.resolve();
    },
    finish(id, ended) {
      sweep();
      const entry = entries.get(id);
      if (entry?.state.status !== 'running') return Promise.resolve(false);
      entries.set(id, { state: ended, endedAt: now() });
      return Promise.resolve(true);
    },
    read(id) {
      sweep();
      return Promise.resolve(entries.get(id)?.state);
    },
  };
}
