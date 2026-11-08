import {
  createTelefactorClient,
  type HarnessList,
  type HarnessTestResult,
  TelefactorRequestError,
} from '@williamthorsen/telefactor/client';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { z } from 'zod';

import { type ConversionJob, conversionJob, type ConversionRequest } from '../../contract/conversion-job.ts';
import type { Problem } from '../../schema/validate-config.ts';
import { promptFileSchema, type PromptList, promptListSchema } from '../../server/prompt-directory-schemas.ts';

/**
 * A request's outcome. `not-found` is a `404`, which the page reads as the server no longer having the job, and
 * `finished` is a cancel that came after the job ended; `failed` covers every other failure, the problems naming why.
 */
export type ClientResult =
  { ok: true; job: ConversionJob } | { ok: false; reason: 'failed' | 'finished' | 'not-found'; problems: Problem[] };

/** The harnesses that the server offers, or the problems that kept the page from reading them. */
export type HarnessListOutcome = { ok: true; list: HarnessList } | { ok: false; problems: Problem[] };

/** A harness test's result, or the problems that kept it from running; `cancelled` marks a test that the page aborted. */
export type HarnessTestOutcome =
  { ok: true; result: HarnessTestResult } | { ok: false; cancelled: boolean; problems: Problem[] };

/**
 * The prompts directory's listing, or why the page has none: `absent` when the server does not serve the directory,
 * `malformed` with the problems of a config file that the server cannot use, and `failed` for every other failure.
 */
export type PromptListOutcome =
  { ok: true; list: PromptList } | { ok: false; reason: 'absent' | 'failed' | 'malformed'; problems: Problem[] };

/** The text of a file in the prompts directory, or the problems that kept the page from reading it. */
export type PromptFileOutcome = { ok: true; text: string } | { ok: false; problems: Problem[] };

/**
 * Starts, reads, and cancels conversions on the conversion server, lists and tests its harnesses, and lists and reads
 * its prompts directory.
 */
export interface ConversionClient {
  cancel(id: string): Promise<ClientResult>;
  listHarnesses(): Promise<HarnessListOutcome>;
  listPrompts(): Promise<PromptListOutcome>;
  read(id: string): Promise<ClientResult>;
  readPromptFile(fileName: string): Promise<PromptFileOutcome>;
  start(request: ConversionRequest): Promise<ClientResult>;
  testHarness(name: string, signal: AbortSignal): Promise<HarnessTestOutcome>;
}

interface ConversionClientOptions {
  /** The server's origin, under which telefactor's routes are served at `/api/telefactor` and the prompts at `/api/prompts`. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates a client for the conversion server: telefactor's client for the job and harness routes, and requests of its
 * own for the prompts routes.
 */
export function createConversionClient({
  baseUrl,
  fetch = globalThis.fetch.bind(globalThis),
}: ConversionClientOptions): ConversionClient {
  /**
   * A response's status and JSON body, or why there is none; `notJsonStatus` is the status of a response whose body is
   * not JSON, and is absent when no response arrived.
   */
  type Received =
    { ok: true; status: number; body: unknown } | { ok: false; notJsonStatus: number | undefined; problems: Problem[] };

  const apiRoot = `${baseUrl.replace(/\/+$/, '')}/api`;
  const telefactorClient = createTelefactorClient({ basePath: `${apiRoot}/telefactor`, fetch, job: conversionJob });

  /** Sends one request to the prompts routes and returns its status and JSON body, or the problem that kept it away. */
  async function receive(url: string): Promise<Received> {
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET' });
    } catch (error) {
      return { ok: false, notJsonStatus: undefined, problems: toProblems(describeUnreachable(error)) };
    }
    try {
      return { ok: true, status: response.status, body: await response.json() };
    } catch {
      const message = `The conversion server answered ${response.status} with a body that is not JSON.`;
      return { ok: false, notJsonStatus: response.status, problems: toProblems(message) };
    }
  }

  return {
    cancel(id) {
      return sendJobRequest(() => telefactorClient.cancelJob(id));
    },
    async listHarnesses() {
      try {
        return { ok: true, list: await telefactorClient.listHarnesses() };
      } catch (error) {
        return { ok: false, problems: describeFailure(error) };
      }
    },
    async listPrompts() {
      const received = await receive(`${apiRoot}/prompts`);
      if (!received.ok)
        return failPromptList(isPageInPlaceOfApi(received.notJsonStatus) ? 'absent' : 'failed', received.problems);
      const { status, body } = received;
      if (status === 200) {
        const failed = failPromptListRead;
        return readBody({ schema: promptListSchema, body, status, failed }, (list) => ({ ok: true, list }));
      }
      if (status === 400) {
        const failed = failMalformedPromptList;
        return readBody({ schema: problemsBodySchema, body, status, failed }, ({ problems }) => failed(problems));
      }
      const reason = status === 404 ? 'absent' : 'failed';
      return failPromptList(reason, toProblems(`The conversion server answered ${status}.`));
    },
    read(id) {
      return sendJobRequest(() => telefactorClient.getJob(id));
    },
    async readPromptFile(fileName) {
      const received = await receive(`${apiRoot}/prompts/files/${encodeURIComponent(fileName)}`);
      if (!received.ok) return { ok: false, problems: received.problems };
      const { status, body } = received;
      const failed = failPromptFile;
      if (status === 200) {
        return readBody({ schema: promptFileSchema, body, status, failed }, ({ text }) => ({ ok: true, text }));
      }
      if (status === 400) {
        return readBody({ schema: problemsBodySchema, body, status, failed }, ({ problems }) => failed(problems));
      }
      return readBody({ schema: errorBodySchema, body, status, failed }, ({ error }) => failed(toProblems(error)));
    },
    start(request) {
      return sendJobRequest(() => telefactorClient.startJob(request));
    },
    async testHarness(name, signal) {
      try {
        return { ok: true, result: await telefactorClient.testHarness(name, { signal }) };
      } catch (error) {
        if (signal.aborted) return { ok: false, cancelled: true, problems: toProblems('The request was cancelled.') };
        return { ok: false, cancelled: false, problems: describeFailure(error) };
      }
    },
  };
}

// region | Helpers
const JOB_REASONS: Partial<Record<number, 'finished' | 'not-found'>> = { 404: 'not-found', 409: 'finished' };

const problemSchema = z.object({ path: z.string(), message: z.string() });

/** The body of a `400` from the prompts routes. */
const problemsBodySchema = z.object({ problems: z.array(problemSchema) });

/** The body of a `403`, `404`, or `413` from the prompts routes. */
const errorBodySchema = z.object({ error: z.string() });

/**
 * Describes a failed request to telefactor's routes: the problems or the error that a refused response states, a body
 * of an unexpected shape, or a server that could not be reached.
 */
function describeFailure(error: unknown): Problem[] {
  if (error instanceof TelefactorRequestError) {
    return error.problems.length > 0 ? error.problems : toProblems(error.message);
  }
  if (error instanceof z.ZodError)
    return toProblems('The conversion server answered with a body of an unexpected shape.');
  return toProblems(describeUnreachable(error));
}

/** Describes a server that could not be reached, with the reason that `fetch` gave. */
function describeUnreachable(error: unknown): string {
  return `The conversion server could not be reached (${describeError(error)}).`;
}

/** Returns a listing of the prompts directory that failed on a config file that the server cannot use. */
function failMalformedPromptList(problems: Problem[]): PromptListOutcome {
  return failPromptList('malformed', problems);
}

/** Returns a read of a file in the prompts directory that failed. */
function failPromptFile(problems: Problem[]): PromptFileOutcome {
  return { ok: false, problems };
}

/** Returns a failed listing of the prompts directory. */
function failPromptList(reason: 'absent' | 'failed' | 'malformed', problems: Problem[]): PromptListOutcome {
  return { ok: false, reason, problems };
}

/** Returns a listing of the prompts directory whose body could not be read. */
function failPromptListRead(problems: Problem[]): PromptListOutcome {
  return failPromptList('failed', problems);
}

/**
 * Reports whether a response that is not JSON is a page that a server without the API answers with, such as a static
 * host's fallback page, rather than a server error, after which a later request may succeed.
 */
function isPageInPlaceOfApi(notJsonStatus: number | undefined): boolean {
  return notJsonStatus !== undefined && notJsonStatus < 500;
}

/** Parses a body with the schema that its status calls for, reporting a body of another shape through `failed`. */
function readBody<T, R>(
  {
    schema,
    body,
    status,
    failed,
  }: { schema: z.ZodType<T>; body: unknown; status: number; failed: (problems: Problem[]) => R },
  toResult: (value: T) => R,
): R {
  const parsed = schema.safeParse(body);
  return parsed.success
    ? toResult(parsed.data)
    : failed(toProblems(`The conversion server answered ${status} with a body of an unexpected shape.`));
}

/** Runs a job request and reads its job, or the reason that the status calls for. */
async function sendJobRequest(request: () => Promise<ConversionJob>): Promise<ClientResult> {
  try {
    return { ok: true, job: await request() };
  } catch (error) {
    const reason = error instanceof TelefactorRequestError ? (JOB_REASONS[error.status] ?? 'failed') : 'failed';
    return { ok: false, reason, problems: describeFailure(error) };
  }
}

/** Returns one problem at the root. */
function toProblems(message: string): Problem[] {
  return [{ path: '', message }];
}
// endregion | Helpers
