import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import type { ProjectConfig } from 'vitest/node';

import { defineRepoVitestConfig } from '../define-config.ts';

const PACKAGES_DIR = new URL('../../../packages/', import.meta.url).pathname;
const SHARED_FACTORY_PATH = '.config/vitest/define-config.ts';
const GIT_ISOLATION_SETUP_FILE = new URL('../vitest.setup.ts', import.meta.url).pathname;

// nmr's isolation tiers, in the order it generates them: the residual tier first, then the named ones.
// Pinned so that a tier it adds or drops fails here rather than passing with a project fewer checked.
const PROJECT_NAMES = ['unit', 'tool', 'localhost', 'remote'];

// A package whose config bypasses the shared factory loses git isolation silently: nothing fails, and
// a suite that spawns git blocks on the developer's signing passphrase instead.
describe('workspace Vitest configs', () => {
  it.each(listWorkspacePackages())('%s composes the shared factory', (packageName) => {
    const configPath = path.join(PACKAGES_DIR, packageName, 'vitest.config.ts');

    expect(existsSync(configPath), `${packageName} has no vitest.config.ts`).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain(SHARED_FACTORY_PATH);
  });
});

describe(defineRepoVitestConfig, () => {
  it('isolates git subprocesses in every project', () => {
    expect(getProjectSetupFiles(defineRepoVitestConfig())).toEqual(
      PROJECT_NAMES.map((name) => [name, [GIT_ISOLATION_SETUP_FILE]]),
    );
  });

  it("keeps a caller's own setup files alongside the shared one", () => {
    const config = defineRepoVitestConfig({ project: { setupFiles: ['./local.setup.ts'] } });

    expect(getProjectSetupFiles(config)).toEqual(
      PROJECT_NAMES.map((name) => [name, [GIT_ISOLATION_SETUP_FILE, './local.setup.ts']]),
    );
  });

  it('resolves workspace packages from source, so a suite runs without a prior build', () => {
    expect(defineRepoVitestConfig().resolve?.conditions).toContain('source');
  });
});

/**
 * Pairs every project with its name and `setupFiles`, narrowing the broad union Vitest models `projects`
 * as. A project that carries neither yields empty values, so it fails an assertion rather than dropping
 * out of the collection and leaving the survivors to satisfy it.
 */
function getProjectSetupFiles(config: ViteUserConfig): Array<[string, string[]]> {
  const projects = config.test?.projects ?? [];

  return projects.map((project) => {
    if (typeof project !== 'object' || !('test' in project)) return ['', []];
    return [getProjectName(project.test.name), toSetupFileList(project.test.setupFiles)];
  });
}

/** Reads a project's name, which Vitest also accepts as a labelled object rather than a bare string. */
function getProjectName(name: ProjectConfig['name']): string {
  if (name === undefined) return '';
  return typeof name === 'string' ? name : name.label;
}

/** Names every directory under `packages/` that holds a workspace package. */
function listWorkspacePackages(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(PACKAGES_DIR, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .toSorted();
}

/** Normalizes Vitest's string-or-array `setupFiles` to a list, empty for a project that sets none. */
function toSetupFileList(setupFiles: ProjectConfig['setupFiles']): string[] {
  if (setupFiles === undefined) return [];
  return Array.isArray(setupFiles) ? setupFiles : [setupFiles];
}
