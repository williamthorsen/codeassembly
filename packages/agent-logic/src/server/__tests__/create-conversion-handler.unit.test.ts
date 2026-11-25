import { claudeCodeProfile } from '@williamthorsen/toolbelt.acp/proposed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConvertResult } from '../../convert/convert-prompt.ts';
import { createFakeConvert, type FakeConvertCall } from '../../test-utils/create-fake-convert.ts';
import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import { type ConversionHandlerOptions, createConversionHandlerWith } from '../create-conversion-handler.ts';
import { createMemoryConversionStore } from '../create-memory-conversion-store.ts';

const ORIGIN = 'http://localhost';
const TIMEOUT_MS = 10 * 60_000;

beforeEach(() => {
  // Leave `setImmediate` real, so that `flush` lets a background run reach the store.
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: Date.parse('2026-11-16T12:00:00.000Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe(createConversionHandlerWith, () => {
  it.each<{ result: ConvertResult; expected: unknown }>([
    {
      result: { ok: true, config: buildMinimalConfig(), text: '{}\n' },
      expected: { ok: true, text: '{}\n' },
    },
    {
      result: { ok: false, problems: [{ path: 'states', message: 'Missing.' }] },
      expected: { ok: false, problems: [{ path: 'states', message: 'Missing.' }] },
    },
    {
      result: { ok: false, outOfScope: { reason: 'No steps.' } },
      expected: { ok: false, outOfScope: { reason: 'No steps.' } },
    },
  ])('starts a conversion that a read finds done with its result', async ({ result, expected }) => {
    const { handle, calls } = setUpHandler();

    const started = await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' });
    const state = await readJson(started);

    expect(started.status).toBe(201);
    expect(started.headers.get('Location')).toBe(`/${state.id}`);
    expect(state).toStrictEqual({
      status: 'running',
      id: state.id,
      name: 'greeter.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      deadline: '2026-11-16T12:10:00.000Z',
    });
    expect(calls[0]?.options).toMatchObject({ prompt: 'Greet.', name: 'greeter.md' });

    await vi.advanceTimersByTimeAsync(90_000);
    getCall(calls).resolve(result);
    await flush();

    const read = await handle('GET', `/${state.id}`);
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toStrictEqual({
      status: 'done',
      id: state.id,
      name: 'greeter.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      endedAt: '2026-11-16T12:01:30.000Z',
      result: expected,
    });
  });

  it("reports a failed run's reason", async () => {
    const { handle, calls } = setUpHandler();
    const { id } = await readJson(await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' }));

    await vi.advanceTimersByTimeAsync(5000);
    getCall(calls).reject(new Error('The agent is not signed in.'));
    await flush();

    await expect((await handle('GET', `/${id}`)).json()).resolves.toStrictEqual({
      status: 'failed',
      id,
      name: 'greeter.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      endedAt: '2026-11-16T12:00:05.000Z',
      reason: 'The agent is not signed in.',
    });
  });

  it('fails a run that ends without a result', async () => {
    const { handle, calls } = setUpHandler();
    const { id } = await readJson(await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' }));

    getCall(calls).end();
    await flush();

    await expect((await handle('GET', `/${id}`)).json()).resolves.toStrictEqual({
      status: 'failed',
      id,
      name: 'greeter.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      endedAt: '2026-11-16T12:00:00.000Z',
      reason: 'The conversion ended without a result.',
    });
  });

  it('cancels a running conversion and aborts its run', async () => {
    const { handle, calls } = setUpHandler();
    const { id } = await readJson(await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' }));

    await vi.advanceTimersByTimeAsync(2000);
    const cancelled = await handle('DELETE', `/${id}`);
    await flush();

    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toStrictEqual({
      status: 'cancelled',
      id,
      name: 'greeter.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      endedAt: '2026-11-16T12:00:02.000Z',
    });
    expect(getCall(calls).options.signal?.aborted).toBe(true);
    await expect((await handle('GET', `/${id}`)).json()).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('answers a cancel after the end with 409 and the ended state', async () => {
    const { handle, calls } = setUpHandler();
    const { id } = await readJson(await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' }));
    getCall(calls).resolve({ ok: false, outOfScope: { reason: 'No steps.' } });
    await flush();

    const cancelled = await handle('DELETE', `/${id}`);

    expect(cancelled.status).toBe(409);
    await expect(cancelled.json()).resolves.toMatchObject({ status: 'done', id });
  });

  it('fails a conversion once its timeout elapses, and aborts its run', async () => {
    const { handle, calls } = setUpHandler();
    const { id } = await readJson(await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' }));

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await flush();

    expect(getCall(calls).options.signal?.aborted).toBe(true);
    await expect((await handle('GET', `/${id}`)).json()).resolves.toStrictEqual({
      status: 'failed',
      id,
      name: 'greeter.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      endedAt: '2026-11-16T12:10:00.000Z',
      reason: 'The conversion did not finish within 10 minutes.',
    });
  });

  it('states a timeout that is not a whole number of minutes in seconds', async () => {
    const { handle } = setUpHandler({ timeoutMs: 90_000 });
    const { id } = await readJson(await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' }));

    await vi.advanceTimersByTimeAsync(90_000);
    await flush();

    await expect((await handle('GET', `/${id}`)).json()).resolves.toMatchObject({
      reason: 'The conversion did not finish within 90 seconds.',
    });
  });

  it('fails a running conversion found past its deadline on a read, without a local run', async () => {
    const store = createMemoryConversionStore();
    await store.create({
      status: 'running',
      id: 'elsewhere',
      name: 'greeter.md',
      startedAt: '2026-11-16T11:00:00.000Z',
      deadline: '2026-11-16T11:10:00.000Z',
    });
    const { handle } = setUpHandler({ store });

    const read = await handle('GET', '/elsewhere');

    await expect(read.json()).resolves.toStrictEqual({
      status: 'failed',
      id: 'elsewhere',
      name: 'greeter.md',
      startedAt: '2026-11-16T11:00:00.000Z',
      endedAt: '2026-11-16T11:10:00.000Z',
      reason: 'The conversion did not finish within 10 minutes.',
    });
  });

  it('refuses a request that `authorize` rejects, before reading its body', async () => {
    const { handle, calls } = setUpHandler({ authorize: () => false });

    const response = await handle('POST', '/', 'not JSON');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toStrictEqual({
      problems: [{ path: '', message: 'The request is not authorized.' }],
    });
    expect(calls).toHaveLength(0);
  });

  it('refuses a body that is not JSON', async () => {
    const { handle } = setUpHandler();

    const response = await handle('POST', '/', '{');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      problems: [{ path: '', message: 'The request body is not JSON.' }],
    });
  });

  it('refuses an invalid start request with its problems', async () => {
    const { handle } = setUpHandler();

    const response = await handle('POST', '/', { prompt: 'Greet.', name: ' ' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({ problems: [{ path: 'name', message: 'Enter a name' }] });
  });

  it('refuses a body past the size cap', async () => {
    const { handle } = setUpHandler();

    const response = await handle('POST', '/', 'x'.repeat(4 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
  });

  it.each(['/unknown', '/a/b'])('answers 404 for %s', async (path) => {
    const { handle } = setUpHandler();

    expect((await handle('GET', path)).status).toBe(404);
  });

  it('answers 405 with the allowed methods for a method that the path does not serve', async () => {
    const { handle } = setUpHandler();

    const onCollection = await handle('GET', '/');
    const onConversion = await handle('POST', '/some-id');

    expect(onCollection.status).toBe(405);
    expect(onCollection.headers.get('Allow')).toBe('POST');
    expect(onConversion.status).toBe(405);
    expect(onConversion.headers.get('Allow')).toBe('DELETE, GET');
  });

  it('serves conversions under the base path', async () => {
    const { handle } = setUpHandler({ basePath: '/api/conversions/' });

    const started = await handle('POST', '/api/conversions', { prompt: 'Greet.', name: 'greeter.md' });
    const { id } = await readJson(started);

    expect(started.headers.get('Location')).toBe(`/api/conversions/${id}`);
    expect((await handle('GET', `/api/conversions/${id}`)).status).toBe(200);
    expect((await handle('POST', '/', { prompt: 'Greet.', name: 'greeter.md' })).status).toBe(404);
    expect((await handle('GET', `/api/conversionsx/${id}`)).status).toBe(404);
  });
});

// region | Helpers
/** Lets every pending callback and promise chain run, so that a background run reaches the store. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Returns the first call of the fake `convert`, failing the test when there is none. */
function getCall(calls: FakeConvertCall[]): FakeConvertCall {
  const call = calls[0];
  if (call === undefined) throw new Error('`convert` was not called.');
  return call;
}

/** Reads a response's body as a conversion state, failing the test when it has no id. */
async function readJson(response: Response): Promise<{ id: string } & Record<string, unknown>> {
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string') {
    throw new Error(`The body has no id: ${JSON.stringify(body)}`);
  }
  return { ...body, id: body.id };
}

/** Creates a handler on a fake `convert` and a function that sends it one request. */
function setUpHandler(overrides: Partial<ConversionHandlerOptions> = {}): {
  handle: (method: string, path: string, body?: unknown) => Promise<Response>;
  calls: FakeConvertCall[];
} {
  const { convert, calls } = createFakeConvert();
  const handler = createConversionHandlerWith(convert)({
    agent: claudeCodeProfile(),
    store: createMemoryConversionStore(),
    authorize: () => true,
    timeoutMs: TIMEOUT_MS,
    ...overrides,
  });
  function handle(method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit =
      body === undefined ? { method } : { method, body: typeof body === 'string' ? body : JSON.stringify(body) };
    return handler(new Request(`${ORIGIN}${path}`, init));
  }
  return { handle, calls };
}
// endregion | Helpers
