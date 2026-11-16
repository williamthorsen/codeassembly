import { randomUUID } from 'node:crypto';

import type { AgentProfile } from '@williamthorsen/toolbelt.acp/proposed';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { type ConversionEvent, convertWithAgent, type ConvertWithAgentOptions } from '../agent/convert-with-agent.ts';
import {
  type ConversionResult,
  type ConversionState,
  type EndedConversionState,
  MAX_PROMPT_BYTES,
  startConversionRequestSchema,
} from '../conversion-protocol/conversion-schemas.ts';
import type { ConvertResult } from '../convert/convert-prompt.ts';
import { formatPath, type Problem } from '../schema/validate-config.ts';
import type { ConversionStore } from './conversion-store.ts';

/**
 * The largest start-request body that the handler reads, in bytes. It leaves room for the JSON escaping of a prompt of
 * `MAX_PROMPT_BYTES`, whose own cap the request schema checks.
 */
const MAX_BODY_BYTES = 4 * MAX_PROMPT_BYTES;

/** How the host serves conversions. */
export interface ConversionHandlerOptions {
  /** The agent profile on which every conversion runs. */
  readonly agent: AgentProfile;
  /** Where the handler keeps each conversion's state. */
  readonly store: ConversionStore;
  /** Reports whether the handler may serve the request; a refused request is answered `403`. */
  readonly authorize: (request: Request) => boolean | Promise<boolean>;
  /** How long a conversion may run before it fails. */
  readonly timeoutMs: number;
  /** The path of the conversions resource, such as `/api/conversions`; `''`, the root, by default. */
  readonly basePath?: string;
}

/** A conversion run, as `convertWithAgent` runs it. */
export type ConvertFunction = (options: ConvertWithAgentOptions) => AsyncIterable<ConversionEvent>;

/**
 * Creates a Fetch handler that serves conversions under `basePath`: `POST {basePath}` starts one and answers `201` with
 * its `running` state and a `Location` of `{basePath}/{id}`; `GET {basePath}/{id}` answers `200` with its state; and
 * `DELETE {basePath}/{id}` cancels it, answering `200` with the `cancelled` state, or `409` with the ended state when
 * it had already ended. Every conversion runs in this process through `convertWithAgent` and fails once `timeoutMs`
 * elapses; a read of a `running` conversion past its deadline reports it failed even when another process holds the
 * run.
 *
 * Every error body is `{ problems }`: `400` for a body that is not a valid start request, `403` for a request that
 * `authorize` refuses, `404` for an unknown path or conversion, `405` for a method that the path does not serve, `413`
 * for a body past 4 MiB, and `500` for a store or an `authorize` that fails.
 *
 * @stage proposed
 * @experimental
 */
export const createConversionHandler: (options: ConversionHandlerOptions) => (request: Request) => Promise<Response> =
  createConversionHandlerWith(convertWithAgent);

/** Returns `createConversionHandler` running conversions through `convert`, which tests replace. */
export function createConversionHandlerWith(
  convert: ConvertFunction,
): (options: ConversionHandlerOptions) => (request: Request) => Promise<Response> {
  return ({ agent, store, authorize, timeoutMs, basePath = '' }) => {
    const base = basePath.replace(/\/+$/, '');
    const runs = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> }>();

    /** Ends a conversion with the timeout's failure, then stops its run when this process holds it. */
    async function endByTimeout(state: { id: string; name: string }): Promise<void> {
      const reason = `The conversion did not finish within ${formatDuration(timeoutMs)}.`;
      try {
        await store.finish(state.id, { status: 'failed', id: state.id, name: state.name, reason });
      } finally {
        runs.get(state.id)?.controller.abort();
      }
    }

    /** Ends a conversion whose timer fired, as `endByTimeout` does, without rejecting. */
    async function endTimedOutRun(state: { id: string; name: string }): Promise<void> {
      try {
        await endByTimeout(state);
      } catch {
        // Leave the stored state for the next read, which applies the deadline again.
      }
    }

    /** Returns the conversion's state, first ending a `running` one whose deadline has passed. */
    async function readCurrent(id: string): Promise<ConversionState | undefined> {
      const state = await store.read(id);
      if (state?.status !== 'running' || Date.parse(state.deadline) > Date.now()) return state;
      await endByTimeout(state);
      return store.read(id);
    }

    /** Runs the conversion to its end and writes its ended state, unless a cancel or a timeout wrote one first. */
    async function run(request: { id: string; name: string; prompt: string }, signal: AbortSignal): Promise<void> {
      const { id, name, prompt } = request;
      try {
        let ended: EndedConversionState = {
          status: 'failed',
          id,
          name,
          reason: 'The conversion ended without a result.',
        };
        try {
          const events = convert({ prompt, name, agent, signal });
          for await (const event of events) {
            if (event.type === 'result') ended = { status: 'done', id, name, result: toConversionResult(event.result) };
          }
        } catch (error) {
          ended = { status: 'failed', id, name, reason: describeError(error) };
        }
        await store.finish(id, ended);
      } catch {
        // A failed write leaves the conversion running, which a read reports as timed out once its deadline passes.
      } finally {
        const entry = runs.get(id);
        if (entry !== undefined) clearTimeout(entry.timer);
        runs.delete(id);
      }
    }

    /** Validates a start request, stores the `running` state, and starts the run without awaiting it. */
    async function start(request: Request): Promise<Response> {
      const text = await readLimitedText(request, MAX_BODY_BYTES);
      if (text === undefined)
        return respondWithProblem(413, `The request body must not exceed ${MAX_BODY_BYTES} bytes.`);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return respondWithProblem(400, 'The request body is not JSON.');
      }
      const parsed = startConversionRequestSchema.safeParse(body);
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path, message }) => ({ path: formatPath(path), message }));
        return Response.json({ problems }, { status: 400 });
      }

      const { prompt, name } = parsed.data;
      const id = randomUUID();
      const startedAt = Date.now();
      const state: ConversionState = {
        status: 'running',
        id,
        name,
        startedAt: new Date(startedAt).toISOString(),
        deadline: new Date(startedAt + timeoutMs).toISOString(),
      };
      await store.create(state);
      const controller = new AbortController();
      const timer = setTimeout(() => void endTimedOutRun(state), timeoutMs);
      runs.set(id, { controller, timer });
      void run({ id, name, prompt }, controller.signal);
      return Response.json(state, { status: 201, headers: { Location: `${base}/${encodeURIComponent(id)}` } });
    }

    /** Cancels a `running` conversion, or reports the state with which it already ended. */
    async function cancel(id: string): Promise<Response> {
      const state = await readCurrent(id);
      if (state === undefined) return respondWithNotFound();
      if (state.status === 'running') {
        const cancelled: EndedConversionState = { status: 'cancelled', id, name: state.name };
        if (await store.finish(id, cancelled)) {
          runs.get(id)?.controller.abort();
          return Response.json(cancelled, { status: 200 });
        }
      }
      const ended = await store.read(id);
      return ended === undefined ? respondWithNotFound() : Response.json(ended, { status: 409 });
    }

    /** Answers a request whose path and method the handler serves. */
    async function serve(request: Request, id: string | undefined): Promise<Response> {
      if (!(await authorize(request))) return respondWithProblem(403, 'The request is not authorized.');
      if (id === undefined) return start(request);
      if (request.method === 'DELETE') return cancel(id);
      const state = await readCurrent(id);
      return state === undefined ? respondWithNotFound() : Response.json(state, { status: 200 });
    }

    return async (request) => {
      const route = matchRoute(base, new URL(request.url).pathname);
      if (route === undefined) return respondWithProblem(404, 'The path is not served.');
      const allowed = route.id === undefined ? ['POST'] : ['DELETE', 'GET'];
      if (!allowed.includes(request.method)) {
        const message = `The method ${request.method} is not allowed here.`;
        return respondWithProblem(405, message, { Allow: allowed.join(', ') });
      }
      try {
        return await serve(request, route.id);
      } catch (error) {
        return respondWithProblem(500, `The conversion handler failed: ${describeError(error)}`);
      }
    };
  };
}

// region | Helpers
/** Formats a duration in whole minutes when it has a whole number of them, and in seconds otherwise. */
function formatDuration(durationMs: number): string {
  const minutes = durationMs / 60_000;
  if (Number.isSafeInteger(minutes)) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const seconds = durationMs / 1000;
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/**
 * Returns the route of a path under `base`: the collection, with `id` absent, or a conversion. Returns `undefined` for
 * a path outside `base` or with segments past the id.
 */
function matchRoute(base: string, pathname: string): { id: string | undefined } | undefined {
  if (!pathname.startsWith(base)) return undefined;
  const rest = pathname.slice(base.length);
  if (rest === '' || rest === '/') return { id: undefined };
  const match = /^\/([^/]+)\/?$/.exec(rest);
  const segment = match?.[1];
  if (segment === undefined) return undefined;
  try {
    return { id: decodeURIComponent(segment) };
  } catch {
    return undefined;
  }
}

/** Reads the request body as text, or returns `undefined` once it exceeds `limit` bytes. */
async function readLimitedText(request: Request, limit: number): Promise<string | undefined> {
  if (Number(request.headers.get('Content-Length')) > limit) return undefined;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    length += chunk.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Answers a path or conversion that the handler does not have. */
function respondWithNotFound(): Response {
  return respondWithProblem(404, 'The conversion was not found.');
}

/** Answers with one problem at the root. */
function respondWithProblem(status: number, message: string, headers?: Record<string, string>): Response {
  const problems: Problem[] = [{ path: '', message }];
  return Response.json({ problems }, { status, ...(headers !== undefined && { headers }) });
}

/** Maps a converter's result to the protocol's, which includes the config's text and not its value. */
function toConversionResult(result: ConvertResult): ConversionResult {
  if (result.ok) return { ok: true, text: result.text };
  return 'problems' in result ? { ok: false, problems: result.problems } : { ok: false, outOfScope: result.outOfScope };
}
// endregion | Helpers
