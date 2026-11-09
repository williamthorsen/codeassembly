// @vitest-environment happy-dom
import type { HarnessList, HarnessTestResult } from '@williamthorsen/telefactor/client';
import { describe, expect, it } from 'vitest';

import type { ConversionJob } from '../../../contract/conversion-job.ts';
import { createConversionClient } from '../conversion-client.ts';

const JOB: ConversionJob = { id: 'job/1', harness: 'claude-code', status: 'running' };

const LIST: HarnessList = {
  source: 'file',
  configPath: '/app/harness.config.json',
  hasConfigFile: true,
  defaultHarness: 'echo',
  timeoutMinutes: 10,
  harnesses: [{ name: 'echo', label: 'Echo', command: ['echo', '{prompt}'], testable: true, interactive: false }],
};

const PASSED: HarnessTestResult = { ok: true, durationMs: 4200, exit: 'exit code 0', output: 'OK' };

describe(createConversionClient, () => {
  it('starts a conversion with a JSON POST under the base URL and returns the job', async () => {
    const { client, requests } = createClient(() => jsonResponse(201, JOB));

    expect(await client.start({ name: 'Refund request', prompt: 'Greet.' })).toStrictEqual({ ok: true, job: JOB });
    expect(requests).toStrictEqual([
      {
        url: 'http://server.test/api/telefactor/jobs',
        method: 'POST',
        signal: undefined,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Refund request', prompt: 'Greet.' }),
      },
    ]);
  });

  it('reads a job with a GET, encoding its id', async () => {
    const done: ConversionJob = { ...JOB, status: 'done', result: { ok: true, config: {}, text: '{}\n' } };
    const { client, requests } = createClient(() => jsonResponse(200, done));

    expect(await client.read('job/1')).toStrictEqual({ ok: true, job: done });
    expect(requests.map(({ url, method }) => [method, url])).toStrictEqual([
      ['GET', 'http://server.test/api/telefactor/jobs/job%2F1'],
    ]);
  });

  it('cancels a job with a DELETE and returns the cancelled job', async () => {
    const cancelled: ConversionJob = { ...JOB, status: 'cancelled' };
    const { client, requests } = createClient(() => jsonResponse(200, cancelled));

    expect(await client.cancel('job/1')).toStrictEqual({ ok: true, job: cancelled });
    expect(requests.map(({ method }) => method)).toStrictEqual(['DELETE']);
  });

  it('returns the problems of a 400', async () => {
    const problems = [{ path: 'name', message: 'Enter a name.' }];
    const { client } = createClient(() => jsonResponse(400, { problems }));

    expect(await client.start({ name: ' ', prompt: 'Greet.' })).toStrictEqual({
      ok: false,
      reason: 'failed',
      problems,
    });
  });

  it.each([
    [403, 'failed'],
    [404, 'not-found'],
    [409, 'finished'],
  ] as const)('reads the error of a %i as %s', async (status, reason) => {
    const { client } = createClient(() => jsonResponse(status, { error: 'Nope.' }));

    expect(await client.cancel('job/1')).toStrictEqual({
      ok: false,
      reason,
      problems: [{ path: '', message: 'Nope.' }],
    });
  });

  it('reports a server that cannot be reached, with the reason', async () => {
    const { client } = createClient(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await client.read('job/1')).toStrictEqual({
      ok: false,
      reason: 'failed',
      problems: [{ path: '', message: 'The conversion server could not be reached (Failed to fetch).' }],
    });
  });

  it('reports a response that is not JSON', async () => {
    const { client } = createClient(() => Promise.resolve(new Response('<html>', { status: 502 })));

    expect(await client.read('job/1')).toStrictEqual({
      ok: false,
      reason: 'failed',
      problems: [
        { path: '', message: 'The response from http://server.test/api/telefactor/jobs/job%2F1 is not JSON.' },
      ],
    });
  });

  it('reports a JSON body of an unexpected shape', async () => {
    const { client } = createClient(() => jsonResponse(200, { id: 1 }));

    expect(await client.read('job/1')).toStrictEqual({
      ok: false,
      reason: 'failed',
      problems: [{ path: '', message: 'The conversion server answered with a body of an unexpected shape.' }],
    });
  });

  it('lists the harnesses with a GET', async () => {
    const { client, requests } = createClient(() => jsonResponse(200, LIST));

    expect(await client.listHarnesses()).toStrictEqual({ ok: true, list: LIST });
    expect(requests.map(({ url, method }) => [method, url])).toStrictEqual([
      ['GET', 'http://server.test/api/telefactor/harnesses'],
    ]);
  });

  it('lists the problems of a malformed config file as a list', async () => {
    const list = { source: 'file', configPath: '/app/harness.config.json', problems: [{ path: '', message: 'Bad.' }] };
    const { client } = createClient(() => jsonResponse(200, list));

    expect(await client.listHarnesses()).toStrictEqual({ ok: true, list });
  });

  it.each([
    ['an unreachable server', () => Promise.reject(new TypeError('Failed to fetch')), 'could not be reached'],
    ['an error status', () => jsonResponse(403, { error: 'Only local requests.' }), 'Only local requests.'],
    ['a list of an unexpected shape', () => jsonResponse(200, { harnesses: 'echo' }), 'unexpected shape'],
  ])('reports %s when listing harnesses', async (_condition, respond, message) => {
    const { client } = createClient(respond);

    expect(await client.listHarnesses()).toStrictEqual({
      ok: false,
      problems: [{ path: '', message: expect.stringContaining(message) }],
    });
  });

  it('tests a harness with a POST, encoding its name, and returns the result', async () => {
    const { client, requests } = createClient(() => jsonResponse(200, PASSED));

    expect(await client.testHarness('claude/code', new AbortController().signal)).toStrictEqual({
      ok: true,
      result: PASSED,
    });
    expect(requests.map(({ url, method }) => [method, url])).toStrictEqual([
      ['POST', 'http://server.test/api/telefactor/harnesses/claude%2Fcode/test'],
    ]);
  });

  it.each([
    ['a 400', () => jsonResponse(400, { problems: [{ path: '', message: 'Bad config.' }] }), 'Bad config.'],
    ['a 409', () => jsonResponse(409, { error: 'The harness echo has no test command.' }), 'no test command'],
    ['an unreachable server', () => Promise.reject(new TypeError('Failed to fetch')), 'could not be reached'],
    ['a result of an unexpected shape', () => jsonResponse(200, { ok: 'yes' }), 'unexpected shape'],
  ])('reports %s when testing a harness', async (_condition, respond, message) => {
    const { client } = createClient(respond);

    expect(await client.testHarness('echo', new AbortController().signal)).toStrictEqual({
      ok: false,
      cancelled: false,
      problems: [{ path: '', message: expect.stringContaining(message) }],
    });
  });

  it('passes the signal of a test to its request, so that aborting it stops the test on the server', async () => {
    const controller = new AbortController();
    const { client, requests } = createClient(() => jsonResponse(200, PASSED));

    await client.testHarness('echo', controller.signal);

    expect(requests[0]?.signal).toBe(controller.signal);
  });

  it('reports a test that the signal aborted as cancelled', async () => {
    const controller = new AbortController();
    const { client } = createClient(() => {
      controller.abort();
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    });

    expect(await client.testHarness('echo', controller.signal)).toMatchObject({ ok: false, cancelled: true });
  });

  it('lists the prompts directory with a GET', async () => {
    const list = { directory: '/app/prompts', configPath: '/app/harness.config.json', entries: [{ name: 'refund' }] };
    const { client, requests } = createClient(() => jsonResponse(200, list));

    expect(await client.listPrompts()).toStrictEqual({ ok: true, list });
    expect(requests.map(({ url, method }) => [method, url])).toStrictEqual([['GET', 'http://server.test/api/prompts']]);
  });

  it.each([
    ['a 404', () => jsonResponse(404, { error: 'Not found.' }), 'absent'],
    ['a page in place of JSON', () => Promise.resolve(new Response('<!doctype html>', { status: 200 })), 'absent'],
    ['a 400', () => jsonResponse(400, { problems: [{ path: '', message: 'Bad config.' }] }), 'malformed'],
    ['an unreachable server', () => Promise.reject(new TypeError('Failed to fetch')), 'failed'],
    [
      'a server error in place of JSON',
      () => Promise.resolve(new Response('Internal Server Error', { status: 500 })),
      'failed',
    ],
    ['a list of an unexpected shape', () => jsonResponse(200, { entries: 'none' }), 'failed'],
  ])('reports %s when listing the prompts directory', async (_condition, respond, reason) => {
    const { client } = createClient(respond);

    expect(await client.listPrompts()).toMatchObject({ ok: false, reason });
  });

  it('reads a file of the prompts directory, encoding its name', async () => {
    const { client, requests } = createClient(() => jsonResponse(200, { text: 'Greet.' }));

    expect(await client.readPromptFile('refund #2.md')).toStrictEqual({ ok: true, text: 'Greet.' });
    expect(requests[0]?.url).toBe('http://server.test/api/prompts/files/refund%20%232.md');
  });

  it.each([
    ['a 404', () => jsonResponse(404, { error: 'The prompts directory does not list refund.md.' }), 'does not list'],
    ['a 413', () => jsonResponse(413, { error: 'refund.md is larger than 1 MiB.' }), 'larger than'],
    ['an unreachable server', () => Promise.reject(new TypeError('Failed to fetch')), 'could not be reached'],
  ])('reports %s when reading a file of the prompts directory', async (_condition, respond, message) => {
    const { client } = createClient(respond);

    expect(await client.readPromptFile('refund.md')).toStrictEqual({
      ok: false,
      problems: [{ path: '', message: expect.stringContaining(message) }],
    });
  });

  it('drops a trailing slash from the base URL', async () => {
    const { client, requests } = createClient(() => jsonResponse(200, JOB), 'http://server.test/');

    await client.read('job/1');

    expect(requests[0]?.url).toBe('http://server.test/api/telefactor/jobs/job%2F1');
  });
});

// region | Helpers
interface RecordedRequest {
  url: string;
  method: string;
  signal: AbortSignal | undefined;
  contentType?: string | null;
  body?: unknown;
}

/** Creates a client over a fake `fetch` that answers every request with `respond` and records it. */
function createClient(
  respond: () => Promise<Response>,
  baseUrl = 'http://server.test',
): { client: ReturnType<typeof createConversionClient>; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client = createConversionClient({
    baseUrl,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push({
        url,
        method: init?.method ?? 'GET',
        signal: init?.signal ?? undefined,
        ...(init?.body !== undefined && {
          contentType: new Headers(init.headers).get('Content-Type'),
          body: init.body,
        }),
      });
      return respond();
    },
  });
  return { client, requests };
}

/** Returns a response with the body as JSON. */
function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(Response.json(body, { status }));
}
// endregion | Helpers
