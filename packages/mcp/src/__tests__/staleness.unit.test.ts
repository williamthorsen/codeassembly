import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isBuildStale } from '../staleness.ts';
import { getStringField, toRecord } from '../test-utils/records.ts';

// region | Test helper: Create a fake package directory mirroring packages/mcp layout

interface FakePackageOptions {
  srcMtimeMs: number;
  distMtimeMs: number;
  /** Source files to create, relative to `src/`. Defaults to `['index.ts']`. */
  srcFiles?: string[];
  omitSrc?: boolean;
  omitCliJs?: boolean;
}

/** Creates a fake package with the given source and dist mtimes, and returns the URL of its `dist/esm/staleness.js`. */
async function createFakePackage(opts: FakePackageOptions): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'mcp-staleness-test-'));

  // Always create dist/esm/ with staleness.js (the "compiled file" we reference)
  const distEsm = join(base, 'dist', 'esm');
  await mkdir(distEsm, { recursive: true });
  await writeFile(join(distEsm, 'staleness.js'), '// compiled');

  if (!opts.omitCliJs) {
    await writeFile(join(distEsm, 'cli.js'), '// sentinel');
    const distDate = new Date(opts.distMtimeMs);
    await utimes(join(distEsm, 'cli.js'), distDate, distDate);
  }

  if (!opts.omitSrc) {
    const srcDir = join(base, 'src');
    const srcFiles = opts.srcFiles ?? ['index.ts'];

    for (const relPath of srcFiles) {
      const fullPath = join(srcDir, relPath);
      const dir = fullPath.slice(0, Math.max(0, fullPath.lastIndexOf('/')));
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, '// source');
      const srcDate = new Date(opts.srcMtimeMs);
      await utimes(fullPath, srcDate, srcDate);
    }
  }

  return pathToFileURL(join(distEsm, 'staleness.js')).href;
}

// endregion | Test helper: Create a fake package directory mirroring packages/mcp layout

describe('isBuildStale', () => {
  it('returns true when source is newer than dist', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now,
      distMtimeMs: now - 10_000,
    });
    expect(await isBuildStale(compiledFileUrl)).toBe(true);
  });

  it('returns false when dist is newer than source', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now - 10_000,
      distMtimeMs: now,
    });
    expect(await isBuildStale(compiledFileUrl)).toBe(false);
  });

  it('returns false when source and dist have equal timestamps', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now,
      distMtimeMs: now,
    });
    expect(await isBuildStale(compiledFileUrl)).toBe(false);
  });

  it('returns false when src/ directory is missing (published package)', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now,
      distMtimeMs: now,
      omitSrc: true,
    });
    expect(await isBuildStale(compiledFileUrl)).toBe(false);
  });

  it('returns false when cli.js is missing (error path)', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now,
      distMtimeMs: now,
      omitCliJs: true,
    });
    expect(await isBuildStale(compiledFileUrl)).toBe(false);
  });

  it('detects staleness from nested source files', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now,
      distMtimeMs: now - 10_000,
      srcFiles: ['tools/deep.ts'],
    });
    expect(await isBuildStale(compiledFileUrl)).toBe(true);
  });

  it.each(['__fixtures__/sample.ts', '__mocks__/client.ts', '__tests__/index.test.ts', 'test-utils/records.ts'])(
    'ignores %s, which the compile command does not build',
    async (ignoredFile) => {
      const now = Date.now();
      const compiledFileUrl = await createFakePackage({
        srcMtimeMs: now - 10_000,
        distMtimeMs: now,
        srcFiles: ['index.ts', ignoredFile],
      });

      // Manually set the ignored file to be much newer than dist
      const base = new URL(compiledFileUrl);
      const distEsm = new URL('.', base);
      const packageRoot = new URL('../..', distEsm);
      const ignoredFilePath = join(new URL('.', packageRoot).pathname, 'src', ignoredFile);
      const newerDate = new Date(now + 10_000);
      await utimes(ignoredFilePath, newerDate, newerDate);

      expect(await isBuildStale(compiledFileUrl)).toBe(false);
    },
  );

  it('ignores non-.ts files in src/', async () => {
    const now = Date.now();
    const compiledFileUrl = await createFakePackage({
      srcMtimeMs: now - 10_000,
      distMtimeMs: now,
      srcFiles: ['index.ts'],
    });

    // Manually add a newer non-.ts file
    const base = new URL(compiledFileUrl);
    const distEsm = new URL('.', base);
    const packageRoot = new URL('../..', distEsm);
    const readmePath = join(new URL('.', packageRoot).pathname, 'src', 'readme.md');
    await writeFile(readmePath, '# readme');
    const newerDate = new Date(now + 10_000);
    await utimes(readmePath, newerDate, newerDate);

    expect(await isBuildStale(compiledFileUrl)).toBe(false);
  });
});

describe('stale build warning delivery', () => {
  // Use vi.doMock to control isBuildStale for these tests.
  // Reset modules so that the dynamic import below picks up the mock rather than a cached module.
  let mockIsBuildStale: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

  beforeEach(() => {
    mockIsBuildStale = vi.fn<() => Promise<boolean>>();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Connects a client to a server that imports the mocked `isBuildStale`. */
  async function createClientWithMockedStaleness(): Promise<{
    client: Client;
    cleanup: () => Promise<void>;
  }> {
    // Mock the staleness module before importing server
    void vi.doMock('../staleness.ts', () => ({
      isBuildStale: mockIsBuildStale,
    }));

    const { createServer } = await import('../server.ts');
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'staleness-test', version: '0.0.1' });
    await client.connect(clientTransport);

    return {
      client,
      cleanup: async () => {
        await Promise.allSettled([client.close(), server.close()]);
      },
    };
  }

  /** Narrows a `callTool` result's content array to records. */
  function getContentItems(result: Awaited<ReturnType<Client['callTool']>>): Array<Record<string, unknown>> {
    const record = toRecord(result, 'tool result');
    const content = record.content;
    if (!Array.isArray(content)) throw new Error('Expected content array');
    return content.map((item: unknown, i: number) => toRecord(item, `content item ${i.toString()}`));
  }

  /** Returns the content item at `index`, throwing when there is none. */
  function itemAt(items: Array<Record<string, unknown>>, index: number): Record<string, unknown> {
    const item = items[index];
    if (item === undefined) throw new Error(`Expected content item at index ${index.toString()}`);
    return item;
  }

  it('adds warning as separate content item when build is stale', async () => {
    mockIsBuildStale.mockResolvedValue(true);
    const { client, cleanup } = await createClientWithMockedStaleness();

    try {
      const result = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const items = getContentItems(result);
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(getStringField(itemAt(items, 0), 'text')).toMatch(/^\u{26A0}\u{FE0F} MCP server build is stale/u);
      // Data content remains in a separate item, not corrupted by the warning
      expect(getStringField(itemAt(items, 1), 'text')).not.toMatch(/\u{26A0}\u{FE0F}/u);
    } finally {
      await cleanup();
    }
  });

  it('shows warning only on first tool call', async () => {
    mockIsBuildStale.mockResolvedValue(true);
    const { client, cleanup } = await createClientWithMockedStaleness();

    try {
      const result1 = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const items1 = getContentItems(result1);
      expect(items1.length).toBeGreaterThanOrEqual(2);
      expect(getStringField(itemAt(items1, 0), 'text')).toMatch(/^\u{26A0}\u{FE0F} MCP server build is stale/u);

      const result2 = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const items2 = getContentItems(result2);
      expect(items2).toHaveLength(1);
      expect(getStringField(itemAt(items2, 0), 'text')).not.toMatch(/\u{26A0}\u{FE0F}/u);
    } finally {
      await cleanup();
    }
  });

  it('adds warning to error responses when build is stale', async () => {
    mockIsBuildStale.mockResolvedValue(true);
    const { client, cleanup } = await createClientWithMockedStaleness();

    try {
      // Call a tool that will fail (nonexistent runDir triggers readFile error)
      const result = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });

      const record = toRecord(result, 'tool result');
      expect(record.isError).toBe(true);

      const items = getContentItems(result);
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(getStringField(itemAt(items, 0), 'text')).toMatch(/^\u{26A0}\u{FE0F} MCP server build is stale/u);
      // Error text is in a separate item, not mixed with the warning
      expect(getStringField(itemAt(items, 1), 'text')).not.toMatch(/\u{26A0}\u{FE0F}/u);
    } finally {
      await cleanup();
    }
  });

  it('does not show warning when build is fresh', async () => {
    mockIsBuildStale.mockResolvedValue(false);
    const { client, cleanup } = await createClientWithMockedStaleness();

    try {
      const result = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const items = getContentItems(result);
      expect(items).toHaveLength(1);
      expect(getStringField(itemAt(items, 0), 'text')).not.toMatch(/\u{26A0}\u{FE0F}/u);
    } finally {
      await cleanup();
    }
  });
});
