import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadPreferences } from '../load-preferences.ts';

describe(loadPreferences, () => {
  it('resolves each surface from the global file when the project file is absent', async () => {
    const home = await makePreferences('home', "commit:\n  title_format: '{type}: {title}'\n");
    const projectRoot = await mkdtemp(join(tmpdir(), 'describe-change-project-'));

    const { templates, warnings } = await loadPreferences({ home, projectRoot });

    expect(templates).toEqual({ commit: '{type}: {title}', ticket: '', pr: '', merge: '' });
    expect(warnings).toEqual([]);
  });

  it('prefers the project value over the global one', async () => {
    const home = await makePreferences('home', "commit:\n  title_format: '{type}: {title}'\n");
    const projectRoot = await makePreferences('project', "commit:\n  title_format: '{title}'\n");

    const { templates } = await loadPreferences({ home, projectRoot });

    expect(templates.commit).toBe('{title}');
  });

  it('falls back per key, so a project file naming one surface inherits the rest', async () => {
    const home = await makePreferences(
      'home',
      "commit:\n  title_format: '{type}: {title}'\npr:\n  title_format: '[{ticket_ref} ]{title}'\n",
    );
    const projectRoot = await makePreferences('project', "commit:\n  title_format: '{title}'\n");

    const { templates } = await loadPreferences({ home, projectRoot });

    expect(templates).toEqual({ commit: '{title}', ticket: '', pr: '[{ticket_ref} ]{title}', merge: '' });
  });

  it('lets an empty project value override a populated global one', async () => {
    const home = await makePreferences('home', "commit:\n  title_format: '{type}: {title}'\n");
    const projectRoot = await makePreferences('project', "commit:\n  title_format: ''\n");

    const { templates } = await loadPreferences({ home, projectRoot });

    expect(templates.commit).toBe('');
  });

  it('reads a key present with no value as empty', async () => {
    const home = await makePreferences('home', "commit:\n  title_format: '{type}: {title}'\n");
    const projectRoot = await makePreferences('project', 'commit:\n  title_format:\n');

    const { templates } = await loadPreferences({ home, projectRoot });

    expect(templates.commit).toBe('');
  });

  it('yields four empty templates when neither file exists', async () => {
    const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
    const projectRoot = await mkdtemp(join(tmpdir(), 'describe-change-project-'));

    const { templates, warnings } = await loadPreferences({ home, projectRoot });

    expect(templates).toEqual({ commit: '', ticket: '', pr: '', merge: '' });
    expect(warnings).toEqual([]);
  });

  it('preserves a template whose YAML quoting would otherwise truncate it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
    const projectRoot = await makePreferences(
      'project',
      "merge:\n  title_format: '[{ticket_ref} ]{title}[ (#{pr_number})]' # the squash subject\n",
    );

    const { templates } = await loadPreferences({ home, projectRoot });

    expect(templates.merge).toBe('[{ticket_ref} ]{title}[ (#{pr_number})]');
  });

  it('reports a non-string value and falls through to the global file', async () => {
    const home = await makePreferences('home', "commit:\n  title_format: '{title}'\n");
    const projectRoot = await makePreferences('project', 'commit:\n  title_format: [1, 2]\n');

    const { templates, warnings } = await loadPreferences({ home, projectRoot });

    expect(templates.commit).toBe('{title}');
    expect(warnings).toEqual([expect.stringContaining('commit.title_format is not a string')]);
  });

  it('throws naming the file when its YAML is malformed', async () => {
    const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
    const projectRoot = await makePreferences('project', 'commit:\n  title_format: "unterminated\n');

    await expect(loadPreferences({ home, projectRoot })).rejects.toThrow(/preferences\.yaml: malformed YAML/);
  });
});

// region | Helpers

/** Creates a temp directory holding `.agents/preferences.yaml` with `content`, and returns the directory. */
async function makePreferences(label: string, content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `describe-change-${label}-`));
  await mkdir(join(root, '.agents'), { recursive: true });
  await writeFile(join(root, '.agents', 'preferences.yaml'), content, 'utf8');
  return root;
}

// endregion | Helpers
