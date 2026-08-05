// Shared test-support helpers for @williamthorsen/kb.
//
// `nmr-compile` ignores only `**/__tests__/**`, so this directory is compiled into `dist`; the package's `files`
// allowlist keeps it out of the published tarball, so it may freely import `node:` test scaffolding. Consumers are
// the package's `**/__tests__/*.test.ts` files; per-test setup that genuinely varies stays local to each test.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ALIASES_FILE, CONFIG_FILE, resolveKbDir, TAXONOMY_FILE } from '../layout/index.ts';
import type { Finding, KbRoot } from '../types.ts';

/** Stages everything under `dir` and commits it with `message`, returning the new commit SHA. */
export function commitAll(dir: string, message: string): string {
  runGit(dir, 'add', '--all');
  runGit(dir, 'commit', '--quiet', '--message', message);
  return runGit(dir, 'rev-parse', 'HEAD').trim();
}

/** Returns the user-global `kb.yaml` registry path for an injected home directory. */
export function getRegistryPathFor(home: string): string {
  return join(home, '.agents', 'kb.yaml');
}

/** Initializes a git repository in `dir` with a deterministic identity and signing disabled, for fixture commits. */
export function initGitRepo(dir: string): void {
  runGit(dir, 'init', '--quiet');
  runGit(dir, 'config', 'user.email', 'test@example.com');
  runGit(dir, 'config', 'user.name', 'Test');
  runGit(dir, 'config', 'commit.gpgsign', 'false');
}

/** Wraps a filesystem path as a `KbRoot`, performing no I/O. */
export function kbRootAt(path: string): KbRoot {
  return { path, kbDir: resolveKbDir(path) };
}

/** Stands up a temp KB root with an initialized `.kb/`, writes any supplied seed files into it, and returns its `KbRoot`. */
export async function makeKbRoot(
  seeds: { aliases?: string; config?: string; taxonomy?: string } = {},
): Promise<KbRoot> {
  const path = await makeTempDir('kb-root-');
  await mkdir(resolveKbDir(path), { recursive: true });
  if (seeds.aliases !== undefined) await writeFile(join(path, ALIASES_FILE), seeds.aliases, 'utf8');
  if (seeds.config !== undefined) await writeFile(join(path, CONFIG_FILE), seeds.config, 'utf8');
  if (seeds.taxonomy !== undefined) await writeFile(join(path, TAXONOMY_FILE), seeds.taxonomy, 'utf8');
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
  await mkdir(resolveKbDir(root), { recursive: true });
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

/**
 * Sorts findings by path, then line, then rule, then message, into a canonical order for order-independent
 * comparison. Message breaks the tie because a vault-scoped rule reports every one of its findings against the same
 * file with no line, so path, line, and rule alone leave them indistinguishable.
 */
export function normalizeFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    if (a.message === b.message) return 0;
    return a.message < b.message ? -1 : 1;
  });
}

/** Runs `git` in `dir` with the given arguments and returns its UTF-8 stdout. For fixture setup only. */
export function runGit(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
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
