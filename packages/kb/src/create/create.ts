import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { loadKbRegistry } from '../discovery/load-registry.ts';
import { registerStore } from '../discovery/register-store.ts';
import { pathExists } from '../filesystem/exists.ts';
import { renderAliasesSeed, renderConfigSeed, renderSchemaSeed } from './render-seeds.ts';

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
}

/** Inputs for {@link create}. `registryPath` is required only when registering. */
export type CreateInput = { targetDir: string; name?: string } & (
  | { register: false }
  | { register: true; registryPath: string }
);

/** The outcome of a {@link create} call: a created store, or a categorical precondition failure. */
export type CreateOutcome =
  | { ok: true; created: CreatedStore }
  | { ok: false; reason: 'kb-exists' | 'name-registered'; message: string };

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

  if (input.register && (await isNameRegistered(input.registryPath, name))) {
    return {
      ok: false,
      reason: 'name-registered',
      message: `a store named "${name}" is already registered in ${input.registryPath}`,
    };
  }

  const created = await scaffold(storePath);

  let registered = false;
  if (input.register) {
    const result = await registerStore({ registryPath: input.registryPath, name, storePath });
    if (result.status === 'already-present') {
      return {
        ok: false,
        reason: 'name-registered',
        message: `a store named "${name}" is already registered in ${input.registryPath}`,
      };
    }
    registered = true;
  }

  return { ok: true, created: { name, storePath, registered, created } };
}

// region | Helpers

const KB_DIR = '.kb';

/** Reports whether a store of the given name already exists in the registry at `registryPath`. */
async function isNameRegistered(registryPath: string, name: string): Promise<boolean> {
  const { entries } = await loadKbRegistry({ userConfigPath: registryPath });
  return entries.some((entry) => entry.name === name);
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
