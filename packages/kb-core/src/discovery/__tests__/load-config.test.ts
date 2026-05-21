import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadKbConfig } from '../load-config.js';

const MERGE_DIR = join(import.meta.dirname, 'fixtures', 'config-merge');
const HOME = join(MERGE_DIR, 'home');
const PROJECT = join(MERGE_DIR, 'project');

describe(loadKbConfig, () => {
  it('returns an empty config when neither registry file exists', async () => {
    const config = await loadKbConfig({ home: '/no/such/home', projectDir: '/no/such/project' });

    expect(config.entries).toEqual([]);
    expect(config.sources).toEqual({});
  });

  it('loads only the user registry when no project directory is given', async () => {
    const config = await loadKbConfig({ home: join(MERGE_DIR, 'only-user-home') });

    expect(config.entries).toHaveLength(1);
    expect(config.entries[0]?.name).toBe('solo');
    expect(config.entries[0]?.source).toBe('user');
    expect(config.sources.user).toBeDefined();
    expect(config.sources.project).toBeUndefined();
  });

  it('loads only the project registry when no user registry exists', async () => {
    const config = await loadKbConfig({
      home: '/no/such/home',
      projectDir: join(MERGE_DIR, 'only-project'),
    });

    expect(config.entries).toHaveLength(1);
    expect(config.entries[0]?.name).toBe('solo');
    expect(config.entries[0]?.source).toBe('project');
  });

  it('replaces a user entry with the project entry of the same name', async () => {
    const config = await loadKbConfig({ home: HOME, projectDir: PROJECT });
    const shared = config.entries.find((entry) => entry.name === 'shared');

    expect(shared?.source).toBe('project');
    expect(shared?.description).toBe('Project-local override of the shared KB');
  });

  it('appends a project-only entry that has no user counterpart', async () => {
    const config = await loadKbConfig({ home: HOME, projectDir: PROJECT });

    expect(config.entries.map((entry) => entry.name).toSorted()).toEqual(['project-only', 'shared', 'user-only']);
  });

  it('resolves a relative path against the registry file directory', async () => {
    const config = await loadKbConfig({ home: HOME, projectDir: PROJECT });
    const projectOnly = config.entries.find((entry) => entry.name === 'project-only');

    expect(projectOnly?.path).toBe(resolve(PROJECT, '.agents', 'project-only-kb'));
  });

  it('expands a leading tilde path against the home directory', async () => {
    const config = await loadKbConfig({ home: HOME, projectDir: PROJECT });
    const userOnly = config.entries.find((entry) => entry.name === 'user-only');

    expect(userOnly?.path).toBe(join(HOME, 'user-only-kb'));
  });

  it('lets the project default win over the user default across files', async () => {
    const config = await loadKbConfig({ home: HOME, projectDir: PROJECT });
    const defaults = config.entries.filter((entry) => entry.default === true);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.name).toBe('project-only');
  });

  it('throws when a tilde path is used but the home directory is empty', async () => {
    await expect(loadKbConfig({ home: '', projectDir: join(MERGE_DIR, 'tilde-project') })).rejects.toThrow(
      /HOME is not set/,
    );
  });

  it('throws naming the offending entries and source file on a duplicate default', async () => {
    await expect(loadKbConfig({ home: '/no/such/home', projectDir: join(MERGE_DIR, 'dup-default') })).rejects.toThrow(
      /dup-default.*alpha.*beta/s,
    );
  });

  it('throws naming the source file when a registry contains malformed YAML', async () => {
    await expect(
      loadKbConfig({ home: '/no/such/home', projectDir: join(MERGE_DIR, 'malformed-yaml') }),
    ).rejects.toThrow(/malformed-yaml.*kb\.yaml: malformed YAML —/s);
  });

  it('throws naming the source file when a registry entry omits its required path', async () => {
    await expect(loadKbConfig({ home: '/no/such/home', projectDir: join(MERGE_DIR, 'bad-structure') })).rejects.toThrow(
      /bad-structure.*kb\.yaml: invalid kb\.yaml —/s,
    );
  });
});
