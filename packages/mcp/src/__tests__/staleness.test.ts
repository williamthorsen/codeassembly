import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isBuildStale } from '../staleness.js';
import { getStringField, toRecord } from './helpers.js';

// ---------------------------------------------------------------------------
// Test helper: create a fake package directory mirroring packages/mcp layout
// ---------------------------------------------------------------------------

interface FakePackageOptions {
  srcMtimeMs: number;
  distMtimeMs: number;
  /** Extra source files to create (relative to src/). Default: ['index.ts'] */
  srcFiles?: string[];
  /** If true, skip creating the src/ directory entirely. */
  omitSrc?: boolean;
  /** If true, skip creating dist/esm/cli.js. */
  omitCliJs?: boolean;
}

let tmpCounter = 0;

async function createFakePackage(opts: FakePackageOptions): Promise<string> {
  tmpCounter += 1;
  const base = join(tmpdir(), `mcp-staleness-test-${Date.now()}-${tmpCounter.toString()}`);

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

  // Return the file:// URL for the fake "staleness.js" in dist/esm/
  return pathToFileURL(join(distEsm, 'staleness.js')).href;
}

// ---------------------------------------------------------------------------
// isBuildStale() unit tests
// ---------------------------------------------------------------------------

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

  it('ignores non-.ts files in src/', async () => {
    const now = Date.now();
    // Create package with only old .ts files and a newer non-.ts file
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

// ---------------------------------------------------------------------------
// Warning delivery tests (protocol-level, mocked isBuildStale)
// ---------------------------------------------------------------------------

describe('stale build warning delivery', () => {
  // Use vi.mock to control isBuildStale for these tests.
  // We need dynamic imports + resetModules to get fresh hasWarned state.
  let mockIsBuildStale: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

  beforeEach(() => {
    mockIsBuildStale = vi.fn<() => Promise<boolean>>();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createClientWithMockedStaleness(): Promise<{
    client: Client;
    cleanup: () => Promise<void>;
  }> {
    // Mock the staleness module before importing server
    vi.doMock('../staleness.js', () => ({
      isBuildStale: mockIsBuildStale,
    }));

    const { createServer } = await import('../server.js');
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

  function getFirstTextContent(result: Awaited<ReturnType<Client['callTool']>>): string {
    const record = toRecord(result, 'tool result');
    const content = record.content;
    if (!Array.isArray(content)) throw new Error('Expected content array');
    const first: unknown = content[0];
    if (first === undefined) throw new Error('Expected at least one content item');
    return getStringField(toRecord(first, 'content item'), 'text');
  }

  it('prepends warning when build is stale', async () => {
    mockIsBuildStale.mockResolvedValue(true);
    const { client, cleanup } = await createClientWithMockedStaleness();

    try {
      const result = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const text = getFirstTextContent(result);
      expect(text).toMatch(/^\u26A0\uFE0F MCP server build is stale/);
    } finally {
      await cleanup();
    }
  });

  it('shows warning only on first tool call', async () => {
    mockIsBuildStale.mockResolvedValue(true);
    const { client, cleanup } = await createClientWithMockedStaleness();

    try {
      // First call - should have warning
      const result1 = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const text1 = getFirstTextContent(result1);
      expect(text1).toMatch(/^\u26A0\uFE0F MCP server build is stale/);

      // Second call - should NOT have warning
      const result2 = await client.callTool({
        name: 'get_run_state',
        arguments: { runDir: '/tmp/nonexistent-' + Date.now().toString() },
      });
      const text2 = getFirstTextContent(result2);
      expect(text2).not.toMatch(/\u26A0\uFE0F MCP server build is stale/);
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
      const text = getFirstTextContent(result);
      expect(text).not.toMatch(/\u26A0\uFE0F MCP server build is stale/);
    } finally {
      await cleanup();
    }
  });
});
