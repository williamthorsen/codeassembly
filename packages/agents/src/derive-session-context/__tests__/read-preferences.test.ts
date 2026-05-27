import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPreferences } from '../read-preferences.ts';

describe(readPreferences, () => {
  let workRoot: string;
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    workRoot = await mkdtemp(path.join(tmpdir(), 'derive-session-context-prefs-'));
    projectDir = path.join(workRoot, 'project');
    homeDir = path.join(workRoot, 'home');
    await mkdir(projectDir, { recursive: true });
    await mkdir(homeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workRoot, { recursive: true, force: true });
  });

  it('returns an empty preferences object when neither file exists', async () => {
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences).toEqual({});
    expect(result.sources).toEqual({});
  });

  it('reads project-only preferences', async () => {
    await writeProjectYaml(projectDir, 'project:\n  slug: my-project\n  ticket_ref_prefix: "#"\n');
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences.project).toEqual({ slug: 'my-project', ticket_ref_prefix: '#' });
    expect(result.sources.project).toBe(path.join(projectDir, '.agents', 'preferences.yaml'));
    expect(result.sources.global).toBeUndefined();
  });

  it('reads global-only preferences', async () => {
    await writeGlobalYaml(homeDir, 'platform: github\nproject:\n  slug: global-default\n');
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences.platform).toBe('github');
    expect(result.preferences.project?.slug).toBe('global-default');
    expect(result.sources.global).toBe(path.join(homeDir, '.agents', 'preferences.yaml'));
    expect(result.sources.project).toBeUndefined();
  });

  it('merges with project values winning over global at the top-level key', async () => {
    // The project file replaces the entire `project:` section. Top-level keys not set at the
    // project level (like `platform:`) come from the global file.
    await writeGlobalYaml(homeDir, 'platform: github\nproject:\n  slug: global-default\n');
    await writeProjectYaml(projectDir, 'project:\n  slug: my-project\n');
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences.platform).toBe('github');
    expect(result.preferences.project?.slug).toBe('my-project');
    // Both sources contributed; confirm the merge does not clear `sources.global`.
    expect(result.sources.project).toBeDefined();
    expect(result.sources.global).toBeDefined();
  });

  it('throws with a file-anchored message on malformed YAML', async () => {
    await writeProjectYaml(projectDir, 'project:\n  slug: [unclosed list\n');
    await expect(readPreferences({ cwd: projectDir, home: homeDir })).rejects.toThrow(/malformed YAML/);
  });

  it('tolerates unknown top-level keys', async () => {
    await writeProjectYaml(projectDir, 'mystery_key: "mystery value"\n');
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences).toEqual({});
  });

  it('tolerates unknown keys inside nested sections', async () => {
    await writeProjectYaml(projectDir, 'artifacts:\n  enabled: true\n  base_dir: ~/foo\n');
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences.artifacts).toEqual({ base_dir: '~/foo' });
  });

  it('tolerates a mix of unknown top-level and nested keys', async () => {
    await writeProjectYaml(
      projectDir,
      [
        'artifacts:',
        '  enabled: true',
        '  base_dir: ~/ai-artifacts',
        'merge_commit:',
        "  title_format: '[{ticket_ref}] {title}'",
        'platform: github',
        'project:',
        '  slug: my-project',
        'worktrees:',
        '  location: sibling',
        '',
      ].join('\n'),
    );
    const result = await readPreferences({ cwd: projectDir, home: homeDir });
    expect(result.preferences).toEqual({
      artifacts: { base_dir: '~/ai-artifacts' },
      platform: 'github',
      project: { slug: 'my-project' },
    });
  });

  it('throws with the offending key path when `platform` is outside the allowed enum', async () => {
    await writeProjectYaml(projectDir, 'platform: gitlab\n');
    await expect(readPreferences({ cwd: projectDir, home: homeDir })).rejects.toThrow(
      /'platform' must be "github" or "bitbucket"/,
    );
  });

  it('throws with the offending key path when a consumed string field has the wrong type', async () => {
    await writeProjectYaml(projectDir, 'artifacts:\n  base_dir: 42\n');
    await expect(readPreferences({ cwd: projectDir, home: homeDir })).rejects.toThrow(
      /'artifacts\.base_dir' must be a string/,
    );
  });

  it('throws with the offending key path when a consumed nested string field has the wrong type', async () => {
    await writeProjectYaml(projectDir, 'repository:\n  default_remote:\n    name: 1234\n    default_branch: main\n');
    await expect(readPreferences({ cwd: projectDir, home: homeDir })).rejects.toThrow(
      /'repository\.default_remote\.name' must be a string/,
    );
  });
});

// region | Helpers

async function writeProjectYaml(projectDir: string, body: string): Promise<void> {
  const agentsDir = path.join(projectDir, '.agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'preferences.yaml'), body, 'utf8');
}

async function writeGlobalYaml(homeDir: string, body: string): Promise<void> {
  const agentsDir = path.join(homeDir, '.agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'preferences.yaml'), body, 'utf8');
}

// endregion | Helpers
