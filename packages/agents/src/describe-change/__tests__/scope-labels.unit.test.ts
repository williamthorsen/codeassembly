import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverWorkspaceDirs, resolveScopes } from '../resolve-scopes.ts';

/** This repository's root, from which the workspaces are discovered and the release-kit config is read. */
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The release-kit config declaring one `scope:` label per workspace, plus `scope:root` for the residual. */
const RELEASE_KIT_CONFIG = new URL('../../../../../.config/release-kit.config.ts', import.meta.url);

describe('scope vocabulary', () => {
  it('derives exactly the scopes that the release-kit config declares as labels', async () => {
    const workspaceDirs = await discoverWorkspaceDirs(REPOSITORY_ROOT);
    const { scopes } = resolveScopes({ paths: [...workspaceDirs, '.'], projectRoot: REPOSITORY_ROOT, workspaceDirs });

    expect(scopes).toEqual(await readDeclaredScopes());
  });
});

// region | Helpers

/**
 * Reads the declared scopes from the release-kit config's `scope:` label keys, sorted.
 *
 * The keys are read textually rather than imported: the config sits outside this package, imports
 * `@williamthorsen/release-kit/config`, and is outside the package's `tsconfig` include set, so importing it would
 * couple the test to a resolution path that nothing else here needs.
 */
async function readDeclaredScopes(): Promise<string[]> {
  const content = await readFile(RELEASE_KIT_CONFIG, 'utf8');
  const scopes = [...content.matchAll(/(?<=['"])scope:([\w.-]+)(?=['"])/g)].map(([, scope]) => scope ?? '');
  if (scopes.length === 0) {
    throw new Error(`${fileURLToPath(RELEASE_KIT_CONFIG)} declares no scope: label`);
  }
  return scopes.sort();
}

// endregion | Helpers
