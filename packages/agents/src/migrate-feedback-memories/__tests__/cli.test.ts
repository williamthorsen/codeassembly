import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { runMigrate } from '../cli.ts';

const MACHINE = 'test-host';

const FEEDBACK = `---
name: feedback-example
description: an example feedback memory
metadata:
  type: feedback
  originSessionId: sess-1
---

Body.
`;

function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Builds a fixture home with one feedback memory under `<home>/.claude/projects/<store>/memory/`. */
async function makeHomeWithMemory(): Promise<{ home: string; memoryPath: string }> {
  const home = await mkdtemp(join(tmpdir(), 'migrate-cli-home-'));
  const memoryDir = join(home, '.claude', 'projects', '-store-a', 'memory');
  await mkdir(memoryDir, { recursive: true });
  const memoryPath = join(memoryDir, 'feedback-example.md');
  await writeFile(memoryPath, FEEDBACK, 'utf8');
  await writeFile(join(memoryDir, 'MEMORY.md'), '# Memory\n\n## Feedback\n\n- [x](feedback-example.md): x\n', 'utf8');
  return { home, memoryPath };
}

/** Writes a feedback memory into `<home>/.claude/projects/<store>/memory/<filename>`, returning its path. */
async function writeStoreMemory(home: string, store: string, filename: string): Promise<string> {
  const memoryDir = join(home, '.claude', 'projects', store, 'memory');
  await mkdir(memoryDir, { recursive: true });
  const memoryPath = join(memoryDir, filename);
  await writeFile(memoryPath, FEEDBACK, 'utf8');
  return memoryPath;
}

describe(runMigrate, () => {
  it('enumerates feedback memories under the resolved projects root', async () => {
    const { home } = await makeHomeWithMemory();

    const result = await runMigrate({
      argv: ['enumerate'],
      stdin: bodyStream(''),
      env: {},
      home,
      machine: MACHINE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !('memories' in result)) return;
    expect(result.memories.map((memory) => memory.slug)).toEqual(['feedback-example']);
    expect(result.machine).toBe(MACHINE);
  });

  it('deletes the paths piped on stdin and reconciles the index', async () => {
    const { home, memoryPath } = await makeHomeWithMemory();

    const result = await runMigrate({
      argv: ['delete'],
      stdin: bodyStream(`${memoryPath}\n`),
      env: {},
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !('results' in result)) return;
    expect(result.results[0]).toMatchObject({ deleted: true, indexUpdated: true });
    await expect(access(memoryPath)).rejects.toThrow();
  });

  it('treats empty stdin for delete as a clean no-op', async () => {
    const result = await runMigrate({ argv: ['delete'], stdin: bodyStream('   \n'), env: {} });

    expect(result.ok).toBe(true);
    if (!result.ok || !('results' in result)) return;
    expect(result.results).toEqual([]);
  });

  it('returns invalid-args for an unknown subcommand', async () => {
    const result = await runMigrate({ argv: ['frobnicate'], stdin: bodyStream(''), env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid-args');
    expect(result.message).toContain('frobnicate');
  });

  it('returns invalid-args when no subcommand is given', async () => {
    const result = await runMigrate({ argv: [], stdin: bodyStream(''), env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid-args');
    expect(result.message).toContain('subcommand is required');
  });

  it('returns invalid-args when enumerate is given a stray argument', async () => {
    const result = await runMigrate({ argv: ['enumerate', 'extra'], stdin: bodyStream(''), env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid-args');
  });

  it('scopes enumeration to one store with --store', async () => {
    const home = await mkdtemp(join(tmpdir(), 'migrate-cli-home-'));
    await writeStoreMemory(home, '-store-a', 'feedback-a.md');
    await writeStoreMemory(home, '-store-b', 'feedback-b.md');

    const result = await runMigrate({
      argv: ['enumerate', '--store', '-store-b'],
      stdin: bodyStream(''),
      env: {},
      home,
      machine: MACHINE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !('memories' in result)) return;
    expect(result.memories.map((memory) => memory.store)).toEqual(['-store-b']);
  });

  it('accepts the --store=<slug> form', async () => {
    const home = await mkdtemp(join(tmpdir(), 'migrate-cli-home-'));
    await writeStoreMemory(home, '-store-a', 'feedback-a.md');
    await writeStoreMemory(home, '-store-b', 'feedback-b.md');

    const result = await runMigrate({
      argv: ['enumerate', '--store=-store-a'],
      stdin: bodyStream(''),
      env: {},
      home,
      machine: MACHINE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !('memories' in result)) return;
    expect(result.memories.map((memory) => memory.store)).toEqual(['-store-a']);
  });

  it('returns invalid-args when --store has no value', async () => {
    const result = await runMigrate({ argv: ['enumerate', '--store'], stdin: bodyStream(''), env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid-args');
    expect(result.message).toContain('--store requires');
  });
});
