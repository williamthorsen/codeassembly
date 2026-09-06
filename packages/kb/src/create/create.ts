import { basename, resolve } from 'node:path';

import { loadKbRegistry } from '../discovery/load-registry.ts';
import { registerStore } from '../discovery/register-store.ts';
import { setDefaultKb } from '../discovery/set-default-kb.ts';
import { pathExists } from '../filesystem/exists.ts';
import { KB_DIR, resolveKbDir } from '../layout/index.ts';
import { scaffold } from '../scaffold/scaffold.ts';
import type { KbRegistry } from '../types.ts';

/**
 * What `create` did about the registry's `default_kb` pointer when registering a store:
 * `set` — it was unset and the new store was the only KB, so the store became the default;
 * `unchanged` — a default was already set and left untouched;
 * `needs-selection` — it was unset but other KBs exist, so the caller should prompt for a choice.
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
  /** Whether the store was registered in the kb.yaml registry. */
  registered: boolean;
  /** Store-relative paths created by the scaffold. */
  created: readonly string[];
  /** What happened to the registry's `default_kb` pointer; absent when the store was not registered. */
  defaultKb?: DefaultKbOutcome;
}

/**
 * Inputs for {@link create}. `registryPath` and `description` belong to the registering form alone: a description is
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
 * registry. Both preconditions — an existing `.kb/`, and (when registering) an already-registered name — are checked
 * before anything is written, so a precondition failure leaves the filesystem untouched. Genuine I/O failures
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
  // Capture the pre-register registry: it drives both the name-collision check and the default-KB decision.
  const before = await loadKbRegistry({ userConfigPath: registryPath });
  if (before.entries.some((entry) => entry.name === name)) {
    return { ok: false, reason: 'name-registered', message: nameRegisteredMessage(name, registryPath) };
  }

  const created = await writeCanonicalSet(storePath);

  const described = input.description !== undefined && { description: input.description };
  const result = await registerStore({ registryPath, name, storePath, ...described });
  if (result.status === 'already-present') {
    return { ok: false, reason: 'name-registered', message: nameRegisteredMessage(name, registryPath) };
  }

  const defaultKb = await ensureDefaultKb({ registryPath, name, before });
  return { ok: true, created: { name, storePath, ...described, registered: true, created, defaultKb } };
}

// region | Helpers

/**
 * Decides — and, for the sole-KB case, applies — what happens to `default_kb` for a freshly-registered store, given
 * the registry state captured before registering. Sets the new store as the default only when no default exists and
 * it is the only registered KB; an existing default is never overwritten, and an ambiguous case is deferred to the
 * caller for an interactive choice.
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
 * Writes the canonical set into a store being created, returning the store-relative paths that it created. A path
 * already present in the target directory is left out, so the report names what this call put there.
 */
async function writeCanonicalSet(storePath: string): Promise<readonly string[]> {
  const entries = await scaffold({ storePath });
  return entries.filter((entry) => entry.action !== 'present').map((entry) => entry.path);
}

// endregion | Helpers
