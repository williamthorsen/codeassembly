import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversionJob, ConversionRequest } from '../../contract/conversion-job.ts';
import type { Problem } from '../../schema/validate-config.ts';
import type { ClientResult, ConversionClient } from './conversion-client.ts';

/** The time between two reads of a running job. */
export const POLL_INTERVAL_MS = 2000;

/** The `sessionStorage` key under which the running job's id and name are kept, so that a reload resumes it. */
export const CONVERSION_STORAGE_KEY = 'agent-logic-viewer.conversion';

/** What the page does with a conversion's outcome, each call naming the prompt. */
export interface ConversionHandlers {
  /** Learns that a conversion was cancelled, by the user or on the server. */
  onCancelled: (name: string) => void;
  /** Takes the agent-logic file's text of a conversion that succeeded. */
  onConverted: (name: string, text: string) => void;
  /** Takes the problems of a conversion that did not produce a file, or of a request that failed. */
  onProblems: (name: string, problems: Problem[]) => void;
  /** Learns that a conversion started running, or that the page resumed one after a reload. */
  onRunning: (name: string) => void;
}

/** The running conversion, if any, and the functions that start and cancel one. */
export interface Conversion {
  running: { name: string } | undefined;
  cancel: () => void;
  start: (request: ConversionRequest) => void;
}

/**
 * Runs one conversion at a time on the conversion server, polling it until it ends. Starting another cancels the
 * current one. The running job's id is kept in `sessionStorage`, and the page resumes it when it loads.
 */
export function useConversion(client: ConversionClient, handlers: ConversionHandlers): Conversion {
  const [running, setRunning] = useState<{ name: string } | undefined>();
  const clientRef = useRef(client);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    clientRef.current = client;
    handlersRef.current = handlers;
  });
  // Count every start, cancel, and unmount, so that a response for a run that has since changed is ignored.
  const runRef = useRef(0);
  const currentRef = useRef<{ id?: string; name: string } | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const stored = readStoredJob();
    if (stored !== undefined) {
      const run = begin(stored);
      void poll(stored, run, { isResumed: true });
    }
    return () => {
      runRef.current += 1;
      clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Resume once, on mount; `begin` and `poll` read only refs.
  }, []);

  /** Makes the job the current one and returns its run. */
  function begin(job: { id?: string; name: string }): number {
    runRef.current += 1;
    clearTimeout(timerRef.current);
    currentRef.current = job;
    setRunning({ name: job.name });
    return runRef.current;
  }

  /** Clears the current job, so that later responses for it are ignored. */
  function end(): void {
    runRef.current += 1;
    clearTimeout(timerRef.current);
    currentRef.current = undefined;
    setRunning(undefined);
    writeStoredJob(undefined);
  }

  /** Waits for a running job, or hands an ended one to the page, under the name of the prompt that it converts. */
  function follow(job: ConversionJob, name: string, run: number, { isResumed }: { isResumed: boolean }): void {
    if (job.status === 'running') {
      const isNew = currentRef.current?.id !== job.id || isResumed;
      currentRef.current = { id: job.id, name };
      writeStoredJob({ id: job.id, name });
      if (isNew) handlersRef.current.onRunning(name);
      timerRef.current = setTimeout(() => {
        void poll({ id: job.id, name }, run, { isResumed: false });
      }, POLL_INTERVAL_MS);
      return;
    }
    end();
    settle(job, name);
  }

  /** Reads the job, then follows it, or reports why it could not be read. */
  async function poll(job: { id: string; name: string }, run: number, options: { isResumed: boolean }): Promise<void> {
    const result = await clientRef.current.read(job.id);
    if (run !== runRef.current) return;
    if (result.ok) {
      follow(result.job, job.name, run, options);
      return;
    }
    end();
    // Forget a stored job that the server no longer has without a word: the page never showed it running.
    if (options.isResumed && result.reason === 'not-found') return;
    report(job.name, result);
  }

  /** Hands a failed request's problems to the page, describing a job that the server no longer has. */
  function report(name: string, result: ClientResult & { ok: false }): void {
    handlersRef.current.onProblems(
      name,
      result.reason === 'not-found'
        ? [
            {
              path: '',
              message:
                'The conversion server no longer has the conversion, as after a restart. Convert the prompt again.',
            },
          ]
        : result.problems,
    );
  }

  /** Hands an ended job's file, problems, out-of-scope verdict, or cancellation to the page. */
  function settle(job: ConversionJob, name: string): void {
    const { onCancelled, onConverted, onProblems } = handlersRef.current;
    if (job.status === 'cancelled') onCancelled(name);
    else if (job.status === 'done' && job.result?.ok === true) onConverted(name, job.result.text);
    else if (job.status === 'done' && job.result !== undefined && 'outOfScope' in job.result)
      onProblems(name, [{ path: '', message: `Out of scope: ${job.result.outOfScope.reason}` }]);
    else if (job.status === 'done' && job.result !== undefined && 'problems' in job.result)
      onProblems(name, job.result.problems);
    else onProblems(name, [{ path: '', message: describeEnd(job) }]);
  }

  /** Cancels the current job, if any, then starts the request and follows its job. */
  async function start(request: ConversionRequest): Promise<void> {
    const previous = currentRef.current;
    if (previous?.id !== undefined) void clientRef.current.cancel(previous.id);
    const run = begin({ name: request.name });
    const result = await clientRef.current.start(request);
    if (run !== runRef.current) {
      // Stop a job whose start was overtaken by a cancel or by another start.
      if (result.ok) void clientRef.current.cancel(result.job.id);
      return;
    }
    if (result.ok) {
      follow(result.job, request.name, run, { isResumed: false });
      return;
    }
    end();
    report(request.name, result);
  }

  /** Ends the current job in the page, then asks the server to cancel it and reports the outcome. */
  async function cancel(): Promise<void> {
    const current = currentRef.current;
    if (current === undefined) return;
    end();
    if (current.id === undefined) {
      handlersRef.current.onCancelled(current.name);
      return;
    }
    const result = await clientRef.current.cancel(current.id);
    if (result.ok) {
      settle(result.job, current.name);
      return;
    }
    if (result.reason !== 'finished') {
      report(current.name, result);
      return;
    }
    // Show what the job produced: it ended before the cancel reached the server.
    const read = await clientRef.current.read(current.id);
    if (read.ok) settle(read.job, current.name);
    else report(current.name, read);
  }

  // Stable across renders: `cancel` and `start` read only refs and state setters.
  const handleCancel = useCallback(() => void cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps -- reads only refs
  const handleStart = useCallback((request: ConversionRequest) => void start(request), []); // eslint-disable-line react-hooks/exhaustive-deps -- reads only refs
  return { running, cancel: handleCancel, start: handleStart };
}

// region | Helpers
/** Returns the reason that a job ended without producing a file. */
function describeEnd(job: ConversionJob): string {
  if (job.status === 'failed') return job.error ?? 'The conversion failed.';
  return 'The conversion ended without a result.';
}

/** Returns the stored running job, or `undefined` when there is none or storage is unavailable. */
function readStoredJob(): { id: string; name: string } | undefined {
  let raw: string | null;
  try {
    raw = globalThis.sessionStorage.getItem(CONVERSION_STORAGE_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
    ? { id: value.id, name: value.name }
    : undefined;
}

/** Stores the running job, or removes the stored one; storage that is unavailable leaves a reload unable to resume. */
function writeStoredJob(job: { id: string; name: string } | undefined): void {
  try {
    if (job === undefined) globalThis.sessionStorage.removeItem(CONVERSION_STORAGE_KEY);
    else globalThis.sessionStorage.setItem(CONVERSION_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // Keep running without a resumable job.
  }
}
// endregion | Helpers
