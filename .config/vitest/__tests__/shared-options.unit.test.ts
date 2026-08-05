import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineVitestConfig } from '@williamthorsen/nmr/vitest';
import { describe, expect, it } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import type { ProjectConfig } from 'vitest/node';

import { sharedVitestOptions } from '../shared-options.ts';

const PACKAGES_DIR = fileURLToPath(new URL('../../../packages/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHARED_OPTIONS_PATH = '.config/vitest/shared-options.ts';
const GIT_ISOLATION_SETUP_FILE = fileURLToPath(new URL('../vitest.setup.ts', import.meta.url));

// nmr's isolation tiers, in the order it generates them: the residual tier first, then the named ones.
// Pinned so that a tier it adds or drops fails here rather than passing with a project fewer checked.
const PROJECT_NAMES = ['unit', 'tool', 'localhost', 'remote'];

const ROOT_VITEST_CONFIG_PATHS = ['vitest.config.ts', 'vitest.root.config.ts'];

// A config that omits the shared layer loses git isolation silently: nothing fails, and a
// suite that spawns git blocks on the developer's signing passphrase instead.
describe('Vitest configs', () => {
  it.each(listVitestConfigPaths())('%s layers in the shared options', (relativeConfigPath) => {
    const configPath = path.join(REPO_ROOT, relativeConfigPath);

    expect(existsSync(configPath), `${relativeConfigPath} does not exist`).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain(SHARED_OPTIONS_PATH);
  });
});

describe('shared Vitest options', () => {
  it('isolates git subprocesses in every project', () => {
    expect(getProjectSetupFiles(defineVitestConfig(sharedVitestOptions))).toEqual(
      PROJECT_NAMES.map((name) => [name, [GIT_ISOLATION_SETUP_FILE]]),
    );
  });

  it("keeps a caller's own setup files alongside the shared one", () => {
    const config = defineVitestConfig(sharedVitestOptions, { project: { setupFiles: ['./local.setup.ts'] } });

    expect(getProjectSetupFiles(config)).toEqual(
      PROJECT_NAMES.map((name) => [name, [GIT_ISOLATION_SETUP_FILE, './local.setup.ts']]),
    );
  });

  it('resolves workspace packages from source, so a suite runs without a prior build', () => {
    expect(defineVitestConfig(sharedVitestOptions).resolve?.conditions).toContain('source');
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

/** Names the repo-root and per-package Vitest config files that must layer in the shared options. */
function listVitestConfigPaths(): string[] {
  const packageConfigPaths = listWorkspacePackages().map((packageName) => `packages/${packageName}/vitest.config.ts`);
  return [...ROOT_VITEST_CONFIG_PATHS, ...packageConfigPaths];
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
