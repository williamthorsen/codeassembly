import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createSourceResolver } from '../../content-sources.ts';
import type { RuleContext } from '../rule-context.ts';

/**
 * Builds the context that `validateContentRoot` hands a rule, resolving `root` ahead of `libraryDir` as it does. The
 * resolved artifacts are empty, which suits every rule that reads the tree rather than the closure.
 */
export function buildRuleContext(root: string, libraryDir: string = root): RuleContext {
  return {
    root,
    libraryDir,
    resolver: createSourceResolver([{ name: root, dir: root }], libraryDir),
    artifacts: { rulebooks: [], skills: [], subagents: [], defects: [] },
  };
}

/**
 * Creates an empty directory under the OS temp dir. Outside the repo tree, a fixture is not below this repository's
 * own declaration or content.
 */
export async function createTempRoot(label: string): Promise<string> {
  const dir = path.join(tmpdir(), `agents-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Removes a directory created by `createTempRoot`. */
export async function removeTempRoot(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Writes `content` to a root-relative path, creating the intervening directories. */
export async function writeFileAt(root: string, relPath: string, content: string): Promise<void> {
  const filePath = path.join(root, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}
