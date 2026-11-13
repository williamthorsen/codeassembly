import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import {
  createHarnessRun,
  createInMemoryJobStore,
  createJobs,
  type Job,
  type Jobs,
} from '@williamthorsen/telefactor/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateConfig } from '../../schema/validate-config.ts';
import { createConversionJobImplementation } from '../conversion-job-implementation.ts';

const FAKE_HARNESS = path.join(import.meta.dirname, '../test-utils/fake-harness.ts');
const VALID_CONFIG = path.join(import.meta.dirname, 'fixtures/refund-request.agent-logic.json');
const PROMPT = 'Greet the user.';
const POLL_INTERVAL_MS = 20;

describe(createConversionJobImplementation, () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'conversion-job-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns the config that the harness writes, and deletes the job directory', async () => {
    const job = await runToEnd(root, ['write', VALID_CONFIG, '{output}']);

    expect(job.status).toBe('done');
    expect(isConfigResult(job.result) && validateConfig(JSON.parse(job.result.text)).ok).toBe(true);
    expect(isConfigResult(job.result) && job.result.text).toBe(await readFile(VALID_CONFIG, 'utf8'));
    expect(existsSync(path.join(root, job.id))).toBe(false);
  });

  it('returns the validation problems of an invalid agent-logic file', async () => {
    const invalidConfig = path.join(root, 'invalid.json');
    await writeFile(invalidConfig, JSON.stringify({ id: 'refund' }));

    const job = await runToEnd(root, ['write', invalidConfig, '{output}']);

    expect(job.status).toBe('done');
    expect(job.result).toMatchObject({ ok: false, problems: expect.arrayContaining([expect.anything()]) });
  });

  it('returns the problems that the command writes when it writes no agent-logic file', async () => {
    const problems = [{ path: 'states.done.meta.quote', message: 'The quote does not occur in the prompt.' }];
    const problemsSource = path.join(root, 'problems.json');
    await writeFile(problemsSource, JSON.stringify({ problems }));

    const job = await runToEnd(root, ['write', problemsSource, '{problems}']);

    expect(job.result).toStrictEqual({ ok: false, problems });
    expect(existsSync(path.join(root, job.id))).toBe(false);
  });

  it('returns the out-of-scope verdict that the command writes in place of an agent-logic file', async () => {
    const verdict = { outOfScope: { reason: 'The prompt states no steps.' } };
    const verdictSource = path.join(root, 'verdict.json');
    await writeFile(verdictSource, JSON.stringify(verdict));

    const job = await runToEnd(root, ['write', verdictSource, '{problems}']);

    expect(job.result).toStrictEqual({ ok: false, ...verdict });
  });

  it('passes the path of the prompt file, named after the job, to the command', async () => {
    const job = await runToEnd(root, ['write', '{prompt}', '{output}']);

    expect(job.result).toStrictEqual({
      ok: false,
      problems: [{ path: '', message: expect.stringContaining('not valid JSON') }],
    });
  });

  it('fails a run that writes neither file', async () => {
    const job = await runToEnd(root, ['silent']);

    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/The harness fake exited without writing .*refund-request\.agent-logic\.json/);
  });

  it('quotes what the harness wrote to stdout when it writes neither file', async () => {
    const job = await runToEnd(root, ['say', 'The prompt file could not be read.']);

    expect(job.error).toMatch(/exited without writing .*\nThe prompt file could not be read\.$/);
  });

  it('keeps the job directory of a failed run, with its prompt file', async () => {
    const job = await runToEnd(root, ['fail', 'the harness is not logged in']);

    expect(job.status).toBe('failed');
    expect(await readFile(path.join(root, job.id, 'refund-request.md'), 'utf8')).toBe(PROMPT);
  });

  it('deletes the job directory of a cancelled run', async () => {
    const pidFile = path.join(root, 'pids');
    const { jobs, settled } = createConversionJobs(root);
    const started = await start(jobs, ['hang', pidFile]);
    // The fake writes the pid file once it runs; the job service does not signal that.
    while (!existsSync(pidFile)) await setTimeout(POLL_INTERVAL_MS);

    await jobs.cancel(started.id);
    await settled(started.id);

    expect(existsSync(path.join(root, started.id))).toBe(false);
  });
});

// region | Helpers
/** The job service that the dev server runs, with promises of each job's recorded end and of its run's settlement. */
interface ConversionJobs {
  jobs: Jobs;
  /** Resolves with the job once the job service records its final state. */
  ended(id: string): Promise<Job<unknown>>;
  /** Resolves once the job's run settles, which follows the release of the job's directory. */
  settled(id: string): Promise<void>;
}

/** Creates the job service that the dev server runs, with job directories under `root`. */
function createConversionJobs(root: string): ConversionJobs {
  const ends = createSignals<Job<unknown>>();
  const settlements = createSignals<undefined>();
  const store = createInMemoryJobStore();
  const job = createConversionJobImplementation({ conversionsDirectory: root });
  const run = createHarnessRun({ workingDirectory: root, job });
  const jobs = createJobs({
    async run(input, signal) {
      try {
        return await run(input, signal);
      } finally {
        settlements.resolve(input.id, undefined);
      }
    },
    store: {
      get(id) {
        return store.get(id);
      },
      async put(recorded) {
        await store.put(recorded);
        if (recorded.status !== 'running') ends.resolve(recorded.id, recorded);
      },
    },
  });
  return { jobs, ended: ends.get, settled: settlements.get };
}

/**
 * Creates promises keyed by id. Each exists from the first call that names its id, so that a value resolved before it
 * is read still reaches the reader.
 */
function createSignals<T>(): { get(id: string): Promise<T>; resolve(id: string, value: T): void } {
  const signals = new Map<string, PromiseWithResolvers<T>>();
  function obtain(id: string): PromiseWithResolvers<T> {
    const existing = signals.get(id);
    if (existing !== undefined) return existing;
    const created = Promise.withResolvers<T>();
    signals.set(id, created);
    return created;
  }
  return {
    get(id) {
      return obtain(id).promise;
    },
    resolve(id, value) {
      obtain(id).resolve(value);
    },
  };
}

function isConfigResult(result: unknown): result is { ok: true; text: string } {
  return typeof result === 'object' && result !== null && 'text' in result && typeof result.text === 'string';
}

/** Runs the fake harness with those arguments as a conversion named "Refund Request", and returns the ended job. */
async function runToEnd(root: string, fakeHarnessArgs: string[]): Promise<Job<unknown>> {
  const { jobs, ended } = createConversionJobs(root);
  const started = await start(jobs, fakeHarnessArgs);
  return ended(started.id);
}

function start(jobs: Jobs, fakeHarnessArgs: string[]): ReturnType<Jobs['start']> {
  return jobs.start(
    { prompt: PROMPT, input: { name: 'Refund Request' } },
    { name: 'fake', command: [process.execPath, FAKE_HARNESS, ...fakeHarnessArgs], timeoutMs: 60_000 },
  );
}
// endregion | Helpers
