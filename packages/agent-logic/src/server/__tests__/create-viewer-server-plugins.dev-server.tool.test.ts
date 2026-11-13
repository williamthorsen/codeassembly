// @vitest-environment happy-dom
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createContractClient,
  createTelefactorClient,
  type Job,
  type TelefactorClient,
} from '@williamthorsen/telefactor/client';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { conversionJob } from '../../contract/conversion-job.ts';
import { viewerContract } from '../../contract/viewer-contract.ts';
import { createViewerServerPlugins, HARNESS_COMMAND_VARIABLE } from '../create-viewer-server-plugins.ts';
import { promptListSchema } from '../prompt-directory-schemas.ts';

const FAKE_HARNESS = path.join(import.meta.dirname, '../test-utils/fake-harness.ts');
const VALID_CONFIG = path.join(import.meta.dirname, 'fixtures/refund-request.agent-logic.json');
const WRITE_COMMAND = [process.execPath, FAKE_HARNESS, 'write', VALID_CONFIG, '{output}'];

describe(createViewerServerPlugins, () => {
  let root = '';
  let server: ViteDevServer | undefined;

  beforeEach(async () => {
    // Vite resolves its root through the symlinks in the temp directory's path.
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viewer-plugins-')));
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it('converts with a harness that harness.config.json defines, and lists the prompts directory that it names', async () => {
    await writeFile(
      path.join(root, 'harness.config.json'),
      JSON.stringify({ promptsDirectory: 'custom', harnesses: { fake: { command: WRITE_COMMAND } } }),
    );
    await mkdir(path.join(root, 'custom'));
    const origin = await start();

    const job = await convert(origin);
    const prompts = await fetch(`${origin}/api/prompts`);

    expect(job.harness).toBe('fake');
    expect(job.result).toMatchObject({ ok: true, text: await readFile(VALID_CONFIG, 'utf8') });
    expect(promptListSchema.parse(await prompts.json())).toMatchObject({ directory: path.join(root, 'custom') });
  });

  it('converts with the harness that AGENT_LOGIC_HARNESS_COMMAND defines', async () => {
    vi.stubEnv(HARNESS_COMMAND_VARIABLE, JSON.stringify(WRITE_COMMAND));
    const origin = await start();

    const job = await convert(origin);

    expect(job.harness).toBe('environment');
    expect(job.result).toMatchObject({ ok: true });
    expect(existsSync(path.join(root, 'tmp', 'conversions', job.id))).toBe(false);
  });

  it('offers the built-in claude-code harness, with an interactive session, without a config file, and creates the default prompts directory', async () => {
    const origin = await start();

    const list = await createClient(origin).listHarnesses();

    expect(list).toMatchObject({
      source: 'built-in',
      hasConfigFile: false,
      defaultHarness: 'claude-code',
      harnesses: [{ name: 'claude-code', testable: true, interactive: true }],
    });
    expect((await stat(path.join(root, 'prompts'))).isDirectory()).toBe(true);
  });

  it("serves the viewer's contract: a saved prompt and a loaded chart reach the session state", async () => {
    const origin = await start();
    const client = createContractClient(viewerContract, { basePath: `${origin}/api/telefactor` });

    const saved = await client.call('save_prompt', { name: 'Refund', text: 'Refund the order.' });
    // Stand in for the conversion, which writes the chart beside the saved prompt.
    await writeFile(path.join(root, 'prompts', 'refund.agent-logic.json'), await readFile(VALID_CONFIG, 'utf8'));
    const loaded = await client.call('load_chart', { fileName: 'refund.agent-logic.json' });

    expect(saved.state.savedPrompt).toStrictEqual({
      fileName: 'refund.md',
      path: path.join(root, 'prompts', 'refund.md'),
    });
    expect(await readFile(path.join(root, 'prompts', 'refund.md'), 'utf8')).toBe('Refund the order.');
    expect(loaded.state.chart?.source).toBe('File: refund.agent-logic.json');
  });

  /**
   * Starts the dev server with the viewer's plugins on a free port, and returns its origin, at which it places the page,
   * so that happy-dom's `fetch` sends the same-origin requests that the guards accept.
   */
  async function start(): Promise<string> {
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: createViewerServerPlugins({ conversionsDirectory: path.join(root, 'tmp', 'conversions') }),
      server: { host: '127.0.0.1', port: 0, watch: null },
    });
    await server.listen();
    const local = server.resolvedUrls?.local[0];
    if (local === undefined) throw new Error('The dev server did not report a URL.');
    const { origin } = new URL(local);
    setPageUrl(origin);
    return origin;
  }
});

// region | Helpers
/** Starts a conversion named "Refund Request" through telefactor's client, and returns the job once it has ended. */
async function convert(origin: string): Promise<Job<unknown>> {
  const client = createClient(origin);
  const started = await client.startJob({ prompt: 'Greet the user.', name: 'Refund Request' });
  // The client does not signal a job's end, so the test reads the job until it ends; each request paces the next.
  let job = await client.getJob(started.id);
  while (job.status === 'running') job = await client.getJob(started.id);
  return job;
}

/** Creates telefactor's client for the conversion job on the dev server at the origin. */
function createClient(origin: string): TelefactorClient<typeof conversionJob> {
  return createTelefactorClient({ basePath: `${origin}/api/telefactor`, job: conversionJob });
}

/** Places the page at the URL, through the API that happy-dom adds to its window. */
function setPageUrl(url: string): void {
  const api: unknown = Reflect.get(globalThis, 'happyDOM');
  const setUrl: unknown = typeof api === 'object' && api !== null ? Reflect.get(api, 'setURL') : undefined;
  if (typeof setUrl !== 'function') throw new TypeError('The test needs the happy-dom environment.');
  Reflect.apply(setUrl, api, [url]);
}
// endregion | Helpers
