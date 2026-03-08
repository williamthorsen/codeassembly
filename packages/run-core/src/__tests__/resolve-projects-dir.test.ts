import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveProjectsDir } from '../resolve-projects-dir.js';

describe('resolveProjectsDir', () => {
  async function createTmpDir(prefix = 'run-core-test-projects-'): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns AI_PROJECTS_PATH when env var is set', async () => {
    vi.stubEnv('AI_PROJECTS_PATH', '/custom/projects');
    const projectRoot = await createTmpDir();
    const result = await resolveProjectsDir(projectRoot);
    expect(result).toBe('/custom/projects');
  });

  it('expands tilde in AI_PROJECTS_PATH', async () => {
    vi.stubEnv('AI_PROJECTS_PATH', '~/my-projects');
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('run-core-test-home-');
    const result = await resolveProjectsDir(projectRoot, { home: fakeHome });
    expect(result).toBe(join(fakeHome, 'my-projects'));
  });

  it('returns {base}/projects from preferences cascade', async () => {
    vi.stubEnv('AI_PROJECTS_PATH', '');
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('run-core-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /custom/artifacts\n');

    const result = await resolveProjectsDir(projectRoot, { home: fakeHome });
    expect(result).toBe('/custom/artifacts/projects');
  });

  it('returns ~/.ai/projects as default fallback', async () => {
    vi.stubEnv('AI_PROJECTS_PATH', '');
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('run-core-test-home-');
    const result = await resolveProjectsDir(projectRoot, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai', 'projects'));
  });

  it('env var takes priority over preferences', async () => {
    vi.stubEnv('AI_PROJECTS_PATH', '/env-projects');
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('run-core-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /prefs-artifacts\n');

    const result = await resolveProjectsDir(projectRoot, { home: fakeHome });
    expect(result).toBe('/env-projects');
  });
});
