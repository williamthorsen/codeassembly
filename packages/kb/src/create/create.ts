import { rm, rmdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { loadKbRegistry } from '../discovery/load-registry.ts';
import { registerStore } from '../discovery/register-store.ts';
import { setDefaultKb } from '../discovery/set-default-kb.ts';
import { pathExists } from '../filesystem/exists.ts';
import { KB_DIR, resolveKbDir } from '../layout/index.ts';
import { scaffold } from '../scaffold/scaffold.ts';
import { isErrorCode } from '../type-guards.ts';
import type { KbRegistry } from '../types.ts';

/**
 * What `create` did about the registry's `default_kb` pointer when registering a store:
 * - `set`: It was unset and the new store was the only KB, so the store became the default.
 * - `unchanged`: A default was already set and left untouched.
 * - `needs-selection`: It was unset but other KBs exist; the caller should prompt for a choice.
 */
export type DefaultKbOutcome = 'set' | 'unchanged' | 'needs-selection';

/** A successfully created store and a record of what was written. */
export interface CreatedStore {
  /** The store's registry name (the directory's base name unless overridden). */
  name: string;
  /** Absolute path to the store root. */
  storePath: string;
  /** The description written into the registry entry; absent when none was supplied. */
  description?: string;
  registered: boolean;
  /** Store-relative paths created by the scaffold. */
  created: readonly string[];
  /** What happened to the registry's `default_kb` pointer; absent when the store was not registered. */
  defaultKb?: DefaultKbOutcome;
}

/**
 * Inputs for {@link create}. `registryPath` and `description` belong to the registering form alone: A description is
 * only ever written into a registry entry, so supplying one without registering is a type error rather than a value
 * that would be silently discarded.
 */
export type CreateInput = { targetDir: string; name?: string } & (
  { register: false } | { register: true; registryPath: string; description?: string }
);

/** The outcome of a {@link create} call: a created store, or a categorical precondition failure. */
export type CreateOutcome =
  { ok: true; created: CreatedStore } | { ok: false; reason: 'kb-exists' | 'name-registered'; message: string };

/**
 * Scaffolds a new knowledge-base store in `targetDir` and, unless `register` is false, registers it in the kb.yaml
 * registry. Both preconditions, an existing `.kb/` and (when registering) an already-registered name, are checked
 * before anything is written. A precondition failure leaves the filesystem untouched. A name collision that the
 * registry writer detects only at write time also returns `name-registered`, after removing the files and the empty
 * directories that this call's scaffold created, so the target directory is left as it was found. Genuine I/O failures
 * propagate.
 */
export async function create(input: CreateInput): Promise<CreateOutcome> {
  const storePath = resolve(input.targetDir);
  const name = input.name ?? basename(storePath);

  if (await pathExists(resolveKbDir(storePath))) {
    return { ok: false, reason: 'kb-exists', message: `a ${KB_DIR}/ store already exists at ${storePath}` };
  }

  if (!input.register) {
    const created = await writeCanonicalSet(storePath);
    return { ok: true, created: { name, storePath, registered: false, created } };
  }

  const { registryPath } = input;
  // Capture the pre-register registry: It is the input to both the name-collision check and the default-KB decision.
  const before = await loadKbRegistry({ userConfigPath: registryPath });
  if (before.entries.some((entry) => entry.name === name)) {
    return { ok: false, reason: 'name-registered', message: nameRegisteredMessage(name, registryPath) };
  }

  const created = await writeCanonicalSet(storePath);

  const described = input.description !== undefined && { description: input.description };
  const result = await registerStore({ registryPath, name, storePath, ...described });
  if (result.status === 'already-present') {
    await removeCreatedSet(storePath, created);
    return { ok: false, reason: 'name-registered', message: nameRegisteredMessage(name, registryPath) };
  }

  const defaultKb = await ensureDefaultKb({ registryPath, name, before });
  return { ok: true, created: { name, storePath, ...described, registered: true, created, defaultKb } };
}

// region | Helpers

/**
 * Decides what happens to `default_kb` for a freshly registered store, given the registry state captured before
 * registering, and sets the pointer in the one case that calls for it. See {@link DefaultKbOutcome} for the cases.
 */
async function ensureDefaultKb(input: {
  registryPath: string;
  name: string;
  before: KbRegistry;
}): Promise<DefaultKbOutcome> {
  if (input.before.defaultKb !== undefined) {
    return 'unchanged';
  }
  if (input.before.entries.length > 0) {
    return 'needs-selection';
  }
  await setDefaultKb({ registryPath: input.registryPath, name: input.name });
  return 'set';
}

/** Builds the "name already registered" precondition-failure message. */
function nameRegisteredMessage(name: string, registryPath: string): string {
  return `a store named "${name}" is already registered in ${registryPath}`;
}

/**
 * Removes the store-relative paths that {@link writeCanonicalSet} reported as created, then `.kb/`, which the
 * `kb-exists` precondition proved absent. Directories go deepest first and only when empty, so content that another
 * writer put there survives.
 */
async function removeCreatedSet(storePath: string, created: readonly string[]): Promise<void> {
  const directories = [`${KB_DIR}/`];
  for (const path of created) {
    if (path.endsWith('/')) {
      directories.push(path);
    } else {
      await rm(join(storePath, path), { force: true });
    }
  }
  const deepestFirst = directories.toSorted((left, right) => right.length - left.length);
  for (const path of deepestFirst) {
    await removeEmptyDirectory(join(storePath, path));
  }
}

/** Removes a directory unless it is absent or not empty. */
async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch (error) {
    // POSIX lets `rmdir` report a non-empty directory as either `ENOTEMPTY` or `EEXIST`.
    if (['EEXIST', 'ENOENT', 'ENOTEMPTY'].every((code) => !isErrorCode(error, code))) {
      throw error;
    }
  }
}

/**
 * Writes the canonical set into a store being created, returning the store-relative paths that it created. A path
 * already present in the target directory is left out, so the report names what this call put there.
 */
async function writeCanonicalSet(storePath: string): Promise<readonly string[]> {
  const entries = await scaffold({ storePath });
  return entries.filter((entry) => entry.action !== 'present').map((entry) => entry.path);
}

// endregion | Helpers
