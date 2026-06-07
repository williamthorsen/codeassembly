// Shared test-support helpers for @codeassembly/kb.
//
// This directory is excluded from the published build via the `**/test-utils/**` ignore in `config/build.ts`,
// so it may freely import `node:` test scaffolding without shipping to `dist`. Consumers are the package's
// `**/__tests__/*.test.ts` files; per-test setup that genuinely varies stays local to each test.

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Finding, KbRoot } from '../types.ts';

/** Returns the user-global `kb.yaml` registry path for an injected home directory. */
export function getRegistryPathFor(home: string): string {
  return join(home, '.agents', 'kb.yaml');
}

/** Wraps a filesystem path as a `KbRoot` with ancestor-walk provenance, performing no I/O. */
export function kbRootAt(path: string): KbRoot {
  return { path, kbDir: join(path, '.kb'), via: 'ancestor-walk' };
}

/** Stands up a temp KB root with an initialized `.kb/`, writes any supplied seed files into it, and returns its `KbRoot`. */
export async function makeKbRoot(seeds: { schema?: string; config?: string; aliases?: string } = {}): Promise<KbRoot> {
  const path = await makeTempDir('kb-root-');
  const kbDir = join(path, '.kb');
  await mkdir(kbDir, { recursive: true });
  if (seeds.schema !== undefined) await writeFile(join(kbDir, 'schema.yaml'), seeds.schema, 'utf8');
  if (seeds.config !== undefined) await writeFile(join(kbDir, 'config.yaml'), seeds.config, 'utf8');
  if (seeds.aliases !== undefined) await writeFile(join(kbDir, 'tag-aliases.yaml'), seeds.aliases, 'utf8');
  return kbRootAt(path);
}

/** Builds a fixture reader bound to `dir`; the returned function reads `dir/name` as UTF-8 text. */
export function makeReadFixture(dir: string): (name: string) => Promise<string> {
  return (name) => readFile(join(dir, name), 'utf8');
}

/** Creates a temp directory and returns an as-yet-uncreated `.agents/kb.yaml` path beneath it. */
export async function makeRegistryPath(): Promise<string> {
  return getRegistryPathFor(await makeTempDir('kb-registry-'));
}

/** Stands up a temp store with an initialized `.kb/` and the given `relativePath → content` files; returns its path. */
export async function makeStore(files: Record<string, string>): Promise<string> {
  const root = await makeTempDir('kb-store-');
  await mkdir(join(root, '.kb'), { recursive: true });
  await writeFiles(root, files);
  return root;
}

/** Creates a fresh empty temp directory with the given prefix. */
export async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Stands up a temp directory populated with the given `relativePath → content` files (no `.kb/`); returns its path. */
export async function makeTree(files: Record<string, string>): Promise<string> {
  const root = await makeTempDir('kb-tree-');
  await writeFiles(root, files);
  return root;
}

/** Sorts findings by path, then line, then rule, into a canonical order for order-independent comparison. */
export function normalizeFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule === b.rule) return 0;
    return a.rule < b.rule ? -1 : 1;
  });
}

/** Writes seed content to a registry path, creating its parent `.agents/` directory first. */
export async function seedRegistry(registryPath: string, content: string): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, content, 'utf8');
}

// region | Helpers

/** Writes each `relativePath → content` entry beneath `root`, creating parent directories as needed. */
async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
}

// endregion | Helpers
