import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveBaseDir } from '../resolve-base-dir.js';

describe('resolveBaseDir', () => {
  async function createTmpDir(prefix = 'mcp-test-resolve-'): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
  }

  it('returns {home}/.ai when no preferences files exist and no baseDir is passed', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai'));
  });

  it('reads artifacts.base_dir from project-level preferences', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /custom/artifacts\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe('/custom/artifacts');
  });

  it('reads artifacts.base_dir from global preferences when project-level is absent', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const globalAgentsDir = join(fakeHome, '.agents');
    await mkdir(globalAgentsDir, { recursive: true });
    await writeFile(join(globalAgentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /global/artifacts\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe('/global/artifacts');
  });

  it('project-level preference takes priority over global preference', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');

    // Create project-level preferences
    const projectAgentsDir = join(projectRoot, '.agents');
    await mkdir(projectAgentsDir, { recursive: true });
    await writeFile(join(projectAgentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /project-level\n');

    // Create global preferences
    const globalAgentsDir = join(fakeHome, '.agents');
    await mkdir(globalAgentsDir, { recursive: true });
    await writeFile(join(globalAgentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /global-level\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe('/project-level');
  });

  it('resolves relative base_dir values from projectRoot', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: .ai\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(projectRoot, '.ai'));
  });

  it('uses absolute base_dir values as-is', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /absolute/path\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe('/absolute/path');
  });

  it('expands tilde in base_dir values from preferences', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: ~/.ai\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai'));
  });

  it('explicit baseDir parameter overrides preferences (absolute)', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    // Create a project-level preference that should be ignored
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: /should-be-ignored\n');

    const result = await resolveBaseDir(projectRoot, '/explicit/override', { home: fakeHome });
    expect(result).toBe('/explicit/override');
  });

  it('explicit baseDir parameter is resolved from projectRoot when relative', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const result = await resolveBaseDir(projectRoot, 'relative/dir', { home: fakeHome });
    expect(result).toBe(join(projectRoot, 'relative/dir'));
  });

  it('handles malformed YAML gracefully — skips silently and falls back', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), ':: invalid yaml {{{\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai'));
  });

  it('handles a preferences file with no artifacts key — falls back', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'orchestration:\n  max_review_rounds: 5\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai'));
  });

  it('handles a preferences file where artifacts is not an object — falls back', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts: just-a-string\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai'));
  });

  it('handles a preferences file where artifacts.base_dir is not a string — falls back', async () => {
    const projectRoot = await createTmpDir();
    const fakeHome = await createTmpDir('mcp-test-home-');
    const agentsDir = join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'preferences.yaml'), 'artifacts:\n  base_dir: 42\n');

    const result = await resolveBaseDir(projectRoot, undefined, { home: fakeHome });
    expect(result).toBe(join(fakeHome, '.ai'));
  });
});
