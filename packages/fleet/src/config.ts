// Runtime configuration. The environment arrives as a parameter — nothing here reads `process.env` — so tests
// resolve against a plain object instead of mutating global state.

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Lane-wide quiet after which a lane derives as closed. */
export const CLOSE_AFTER_MS = 1_800_000;

/** Quiet window after a burst of watch events before the store folds and broadcasts once. */
export const DEBOUNCE_MS = 100;

/** Interval between SSE comment heartbeats that keep idle connections alive through proxies and browsers. */
export const HEARTBEAT_MS = 15_000;

/** Window of lane-wide quiet (3 days) after which an idle lane is evicted from the store and drops from the fleet. */
export const RETENTION_MS = 259_200_000;

/** Resolved server configuration; every timing value is injectable so tests run on short intervals. */
export interface FleetConfig {
  /** Milliseconds of lane-wide quiet after which a lane derives as closed. */
  closeAfterMs: number;
  /** Milliseconds of watch-event quiet before a fold-and-broadcast fires. */
  debounceMs: number;
  /** Root of the append-only lifecycle-event tree. */
  eventsDir: string;
  /** Milliseconds between SSE comment heartbeats. */
  heartbeatMs: number;
  port: number;
  /** Milliseconds between full rescans of the events tree — the correctness backstop when watching degrades. */
  rescanMs: number;
  /** Milliseconds of lane-wide quiet after which an idle lane is evicted from the store. */
  retentionMs: number;
  /** Milliseconds of quiet after which a working session reads as stale. */
  staleMs: number;
}

/**
 * Resolves the server configuration from `env`, applying defaults for anything unset. An empty or non-numeric
 * variable counts as unset rather than producing an empty path or `NaN` interval.
 */
export function resolveConfig(env: Record<string, string | undefined>): FleetConfig {
  return {
    closeAfterMs: CLOSE_AFTER_MS,
    debounceMs: DEBOUNCE_MS,
    eventsDir: readString(env.FLEET_EVENTS_DIR) ?? join(homedir(), '.codeassembly', 'events'),
    heartbeatMs: HEARTBEAT_MS,
    port: readNumber(env.FLEET_PORT) ?? 4178,
    rescanMs: readNumber(env.FLEET_RESCAN_MS) ?? 5000,
    retentionMs: readNumber(env.FLEET_RETENTION_MS) ?? RETENTION_MS,
    staleMs: readNumber(env.FLEET_STALE_MS) ?? 90_000,
  };
}

// region | Helpers

/** Parses an environment value as a finite number, returning `undefined` when absent or non-numeric. */
function readNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Returns the environment value, treating an empty string as unset. */
function readString(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

// endregion | Helpers
