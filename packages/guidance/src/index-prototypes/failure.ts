import type { IndexPrototypesFailure } from './types.ts';

/** Returns a failure result. */
export function fail(error: IndexPrototypesFailure['error'], message: string): IndexPrototypesFailure {
  return { ok: false, error, message };
}
