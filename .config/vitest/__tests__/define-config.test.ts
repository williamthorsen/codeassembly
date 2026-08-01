import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';

import { defineRepoVitestConfig } from '../define-config.ts';

const PACKAGES_DIR = new URL('../../../packages/', import.meta.url).pathname;
const SHARED_FACTORY_PATH = '.config/vitest/define-config.ts';
const GIT_ISOLATION_SETUP_FILE = new URL('../vitest.setup.ts', import.meta.url).pathname;

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
    const projects = getProjectSetupFiles(defineRepoVitestConfig());

    expect(projects.length).toBeGreaterThan(0);
    for (const setupFiles of projects) {
      expect(setupFiles).toContain(GIT_ISOLATION_SETUP_FILE);
    }
  });

  it("keeps a caller's own setup files alongside the shared one", () => {
    const projects = getProjectSetupFiles(defineRepoVitestConfig({ project: { setupFiles: ['./local.setup.ts'] } }));

    for (const setupFiles of projects) {
      expect(setupFiles).toEqual([GIT_ISOLATION_SETUP_FILE, './local.setup.ts']);
    }
  });

  it('resolves workspace packages from source, so a suite runs without a prior build', () => {
    expect(defineRepoVitestConfig().resolve?.conditions).toContain('source');
  });
});

/** Collects each project's `setupFiles`, narrowing the broad union Vitest models `projects` as. */
function getProjectSetupFiles(config: ViteUserConfig): string[][] {
  const projects = config.test?.projects ?? [];

  return projects.flatMap((project) => {
    if (typeof project !== 'object' || !('test' in project)) return [];
    const setupFiles = project.test?.setupFiles;
    return setupFiles === undefined ? [] : [Array.isArray(setupFiles) ? setupFiles : [setupFiles]];
  });
}

/** Names every directory under `packages/` that holds a workspace package. */
function listWorkspacePackages(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(PACKAGES_DIR, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .toSorted();
}
