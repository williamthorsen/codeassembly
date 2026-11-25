import { claudeCodeProfile } from '@williamthorsen/toolbelt.acp/proposed';
import { describe, expect, it } from 'vitest';

import { createConversionHandlerWith } from '../../server/create-conversion-handler.ts';
import { createMemoryConversionStore } from '../../server/create-memory-conversion-store.ts';
import { createFakeConvert, type FakeConvertCall } from '../../test-utils/create-fake-convert.ts';
import { type ConversionClient, type ConversionOutcome, createConversionClient } from '../create-conversion-client.ts';

const ORIGIN = 'http://localhost';
const URL_PATH = '/api/conversions';
const REQUEST = { prompt: 'Greet.', name: 'greeter.md' };
const ANY_TIMES = { startedAt: expect.any(String), endedAt: expect.any(String) };

describe(createConversionClient, () => {
  it('starts a conversion that a second client resumes by id and watches to its end', async () => {
    const { createClient, calls } = setUpServer();
    const started = await createClient().start(REQUEST);
    const id = getId(started);

    const outcomes: ConversionOutcome[] = [];
    const watch = createClient().watch(id, { intervalMs: 1 });
    for await (const outcome of watch) {
      outcomes.push(outcome);
      if (outcomes.length === 1) getCall(calls).resolve({ ok: false, outOfScope: { reason: 'No steps.' } });
    }

    expect(started).toMatchObject({ ok: true, conversion: { status: 'running', name: 'greeter.md' } });
    expect(outcomes.at(0)).toMatchObject({ ok: true, conversion: { status: 'running' } });
    expect(outcomes.at(-1)).toStrictEqual({
      ok: true,
      conversion: {
        status: 'done',
        id,
        name: 'greeter.md',
        ...ANY_TIMES,
        result: { ok: false, outOfScope: { reason: 'No steps.' } },
      },
    });
  });

  it('cancels a running conversion, returning the cancelled state', async () => {
    const { createClient } = setUpServer();
    const client = createClient();
    const id = getId(await client.start(REQUEST));

    await expect(client.cancel(id)).resolves.toStrictEqual({
      ok: true,
      conversion: { status: 'cancelled', id, name: 'greeter.md', ...ANY_TIMES },
    });
  });

  it('returns the ended state for a cancel after the end', async () => {
    const { createClient, calls } = setUpServer();
    const client = createClient();
    const id = getId(await client.start(REQUEST));
    getCall(calls).reject(new Error('Boom.'));
    await waitForEnd(client, id);

    await expect(client.cancel(id)).resolves.toStrictEqual({
      ok: true,
      conversion: { status: 'failed', id, name: 'greeter.md', ...ANY_TIMES, reason: 'Boom.' },
    });
  });

  it('reports a conversion that the server does not have as not found', async () => {
    const client = setUpServer().createClient();

    await expect(client.read('missing')).resolves.toMatchObject({ ok: false, reason: 'not-found' });
    await expect(client.cancel('missing')).resolves.toMatchObject({ ok: false, reason: 'not-found' });
  });

  it("reports a refused start with the server's problems", async () => {
    const client = setUpServer().createClient();

    await expect(client.start({ prompt: 'Greet.', name: ' ' })).resolves.toStrictEqual({
      ok: false,
      reason: 'failed',
      problems: [{ path: 'name', message: 'Enter a name' }],
    });
  });

  it.each([
    {
      fetch: () => Promise.resolve(new Response('<html>', { status: 200 })),
      message: 'The conversion server answered 200 with a body that is not JSON.',
    },
    {
      fetch: () => Promise.resolve(Response.json({ status: 'pending' }, { status: 200 })),
      message: 'The conversion server answered 200 with a body of an unexpected shape.',
    },
    {
      fetch: () => Promise.reject(new TypeError('fetch failed')),
      message: 'The conversion server could not be reached (fetch failed).',
    },
  ])('reports a failed read: $message', async ({ fetch, message }) => {
    const client = createConversionClient({ url: URL_PATH, fetch });

    await expect(client.read('c1')).resolves.toStrictEqual({
      ok: false,
      reason: 'failed',
      problems: [{ path: '', message }],
    });
  });

  it('returns without yielding from a watch whose signal has aborted', async () => {
    const { createClient } = setUpServer();
    const client = createClient();
    const id = getId(await client.start(REQUEST));

    const outcomes = await Array.fromAsync(client.watch(id, { signal: AbortSignal.abort() }));

    expect(outcomes).toHaveLength(0);
    await client.cancel(id);
  });

  it('stops a watch promptly when its signal aborts during the wait', async () => {
    const { createClient } = setUpServer();
    const client = createClient();
    const id = getId(await client.start(REQUEST));
    const controller = new AbortController();

    const outcomes: ConversionOutcome[] = [];
    const watch = client.watch(id, { signal: controller.signal, intervalMs: 60_000 });
    for await (const outcome of watch) {
      outcomes.push(outcome);
      controller.abort();
    }

    expect(outcomes).toHaveLength(1);
    await client.cancel(id);
  });
});

// region | Helpers
/** Returns the id of a started conversion, failing the test when the start failed. */
function getId(outcome: ConversionOutcome): string {
  if (!outcome.ok) throw new Error(`The start failed: ${JSON.stringify(outcome.problems)}`);
  return outcome.conversion.id;
}

/** Returns the first call of the fake `convert`, failing the test when there is none. */
function getCall(calls: FakeConvertCall[]): FakeConvertCall {
  const call = calls[0];
  if (call === undefined) throw new Error('`convert` was not called.');
  return call;
}

/** Creates a handler on a fake `convert` and a function that creates clients whose `fetch` calls it in process. */
function setUpServer(): { createClient: () => ConversionClient; calls: FakeConvertCall[] } {
  const { convert, calls } = createFakeConvert();
  const handler = createConversionHandlerWith(convert)({
    agent: claudeCodeProfile(),
    store: createMemoryConversionStore(),
    authorize: () => true,
    timeoutMs: 60_000,
    basePath: URL_PATH,
  });
  function createClient(): ConversionClient {
    return createConversionClient({
      url: URL_PATH,
      fetch: (input, init) => {
        if (typeof input !== 'string') throw new TypeError('The client requests a URL string.');
        return handler(new Request(new URL(input, ORIGIN), init));
      },
    });
  }
  return { createClient, calls };
}

/** Watches the conversion until it ends. */
async function waitForEnd(client: ConversionClient, id: string): Promise<void> {
  const watch = client.watch(id, { intervalMs: 1 });
  for await (const outcome of watch) {
    if (!outcome.ok) throw new Error('The watch failed.');
  }
}
// endregion | Helpers
