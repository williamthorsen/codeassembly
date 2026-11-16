import { describeError } from '@williamthorsen/toolbelt.errors';
import type { z } from 'zod';

import {
  type ConversionState,
  conversionStateSchema,
  problemsBodySchema,
  type StartConversionRequest,
} from '../conversion-protocol/conversion-schemas.ts';
import type { Problem } from '../schema/validate-config.ts';

/** How long `watch` waits between reads by default. */
const DEFAULT_WATCH_INTERVAL_MS = 2000;

/**
 * A request's outcome: the conversion's state, or why there is none. `not-found` is a conversion that the server does
 * not have, such as one that it dropped after its retention period; `failed` covers every other failure, the problems
 * naming why.
 */
export type ConversionOutcome =
  { ok: true; conversion: ConversionState } | { ok: false; reason: 'failed' | 'not-found'; problems: Problem[] };

/** Starts, reads, cancels, and watches conversions on a server that `createConversionHandler` serves. */
export interface ConversionClient {
  /** Cancels a conversion; a conversion that had already ended is reported with its ended state. */
  cancel(id: string): Promise<ConversionOutcome>;
  read(id: string): Promise<ConversionOutcome>;
  start(request: StartConversionRequest): Promise<ConversionOutcome>;
  /**
   * Reads the conversion every `intervalMs` (2 s by default) and yields each outcome, stopping after an ended state or
   * a failed outcome. Returns without yielding again once the signal aborts.
   */
  watch(id: string, options?: { signal?: AbortSignal; intervalMs?: number }): AsyncGenerator<ConversionOutcome>;
}

export interface ConversionClientOptions {
  /** The URL of the conversions resource, at which the server's handler serves its `basePath`. */
  url: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates a client for the conversion routes, which validates every response body.
 *
 * @stage proposed
 * @experimental
 */
export function createConversionClient({
  url,
  fetch = globalThis.fetch.bind(globalThis),
}: ConversionClientOptions): ConversionClient {
  const collectionUrl = url.replace(/\/+$/, '');

  /** Sends one request and reads its outcome, treating `successStatuses` as answers that contain a state. */
  async function send(
    target: string,
    init: RequestInit,
    successStatuses: readonly number[],
  ): Promise<ConversionOutcome> {
    let response: Response;
    try {
      response = await fetch(target, init);
    } catch (error) {
      return fail(`The conversion server could not be reached (${describeError(error)}).`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return fail(`The conversion server answered ${response.status} with a body that is not JSON.`);
    }
    const { status } = response;
    if (successStatuses.includes(status)) {
      return readBody(conversionStateSchema, body, status, (conversion) => ({ ok: true, conversion }));
    }
    const reason = status === 404 ? 'not-found' : 'failed';
    return readBody(problemsBodySchema, body, status, ({ problems }) => ({ ok: false, reason, problems }));
  }

  /** Reads a conversion, or returns `undefined` once the signal has aborted. */
  async function readOnce(id: string, signal?: AbortSignal): Promise<ConversionOutcome | undefined> {
    if (isAborted(signal)) return undefined;
    const outcome = await send(toConversionUrl(id), { method: 'GET', ...(signal !== undefined && { signal }) }, [200]);
    return isAborted(signal) ? undefined : outcome;
  }

  /** Returns the URL of one conversion. */
  function toConversionUrl(id: string): string {
    return `${collectionUrl}/${encodeURIComponent(id)}`;
  }

  return {
    async cancel(id) {
      return send(toConversionUrl(id), { method: 'DELETE' }, [200, 409]);
    },
    async read(id) {
      return send(toConversionUrl(id), { method: 'GET' }, [200]);
    },
    async start(request) {
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) };
      return send(collectionUrl, init, [201]);
    },
    async *watch(id, { signal, intervalMs = DEFAULT_WATCH_INTERVAL_MS } = {}) {
      let outcome = await readOnce(id, signal);
      while (outcome !== undefined) {
        yield outcome;
        if (!outcome.ok || outcome.conversion.status !== 'running') return;
        await waitFor(intervalMs, signal);
        outcome = await readOnce(id, signal);
      }
    },
  };
}

// region | Helpers
/** Returns a failed outcome with one problem at the root. */
function fail(message: string): ConversionOutcome {
  return { ok: false, reason: 'failed', problems: [{ path: '', message }] };
}

/** Reports whether the signal has aborted. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Parses a body with the schema that its status calls for, reporting a body of another shape as failed. */
function readBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  status: number,
  toOutcome: (value: T) => ConversionOutcome,
): ConversionOutcome {
  const parsed = schema.safeParse(body);
  return parsed.success
    ? toOutcome(parsed.data)
    : fail(`The conversion server answered ${status} with a body of an unexpected shape.`);
}

/** Resolves once `durationMs` has passed, or as soon as the signal aborts. */
function waitFor(durationMs: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (isAborted(signal)) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, durationMs);
    signal?.addEventListener('abort', finish, { once: true });

    /** Settles the wait and releases its timer and listener. */
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    }
  });
}
// endregion | Helpers
