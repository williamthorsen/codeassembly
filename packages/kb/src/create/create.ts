import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { loadKbRegistry } from '../discovery/load-registry.ts';
import { registerStore } from '../discovery/register-store.ts';
import { setDefaultKb } from '../discovery/set-default-kb.ts';
import { pathExists } from '../filesystem/exists.ts';
import type { KbRegistry } from '../types.ts';
import { renderAliasesSeed, renderConfigSeed, renderSchemaSeed } from './render-seeds.ts';

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
  /** Whether the store was registered in the kb.yaml registry. */
  registered: boolean;
  /** Store-relative paths created by the scaffold. */
  created: readonly string[];
  /** What happened to the registry's `default_kb` pointer; absent when the store was not registered. */
  defaultKb?: DefaultKbOutcome;
}

/** Inputs for {@link create}. `registryPath` is required only when registering. */
export type CreateInput = { targetDir: string; name?: string } & (
  { register: false } | { register: true; registryPath: string }
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

  if (await pathExists(join(storePath, KB_DIR))) {
    return { ok: false, reason: 'kb-exists', message: `a ${KB_DIR}/ store already exists at ${storePath}` };
  }

  if (!input.register) {
    const created = await scaffold(storePath);
    return { ok: true, created: { name, storePath, registered: false, created } };
  }

  const { registryPath } = input;
  // Capture the pre-register registry: it drives both the name-collision check and the default-KB decision.
  const before = await loadKbRegistry({ userConfigPath: registryPath });
  if (before.entries.some((entry) => entry.name === name)) {
    return { ok: false, reason: 'name-registered', message: nameRegisteredMessage(name, registryPath) };
  }

  const created = await scaffold(storePath);

  const result = await registerStore({ registryPath, name, storePath });
  if (result.status === 'already-present') {
    return { ok: false, reason: 'name-registered', message: nameRegisteredMessage(name, registryPath) };
  }

  const defaultKb = await ensureDefaultKb({ registryPath, name, before });
  return { ok: true, created: { name, storePath, registered: true, created, defaultKb } };
}

// region | Helpers

const KB_DIR = '.kb';

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

/** Writes the `.kb/` seed files and the content directories, returning the store-relative paths created. */
async function scaffold(storePath: string): Promise<readonly string[]> {
  const kbDir = join(storePath, KB_DIR);
  await mkdir(kbDir, { recursive: true });
  await writeFile(join(kbDir, 'schema.yaml'), renderSchemaSeed(), 'utf8');
  await writeFile(join(kbDir, 'config.yaml'), renderConfigSeed(), 'utf8');
  await writeFile(join(kbDir, 'tag-aliases.yaml'), renderAliasesSeed(), 'utf8');

  await mkdir(join(storePath, 'content', 'events'), { recursive: true });

  return ['.kb/schema.yaml', '.kb/config.yaml', '.kb/tag-aliases.yaml', 'content/', 'content/events/'];
}

// endregion | Helpers
