import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readDeclaredScopes } from '../read-declared-scopes.ts';

describe(readDeclaredScopes, () => {
  it('reads each declared directory, naming it by `name` or else by its basename', async () => {
    const root = await writeRoot(
      ['apps/devopticon', 'tools/ios-shell'],
      'project:\n  scopes:\n    - path: apps/devopticon\n    - path: tools/ios-shell\n      name: ios\n',
    );

    expect(await readDeclaredScopes(root)).toEqual({
      scopeDirs: [
        { dir: join(root, 'apps/devopticon'), name: 'devopticon' },
        { dir: join(root, 'tools/ios-shell'), name: 'ios' },
      ],
      warnings: [],
    });
  });

  it('normalizes a path with a leading `./` or a trailing slash', async () => {
    const root = await writeRoot(['apps/devopticon'], 'project:\n  scopes:\n    - path: ./apps/devopticon/\n');

    expect((await readDeclaredScopes(root)).scopeDirs).toEqual([
      { dir: join(root, 'apps/devopticon'), name: 'devopticon' },
    ]);
  });

  it.each([
    ['there is no preferences file', undefined],
    ['the file has no `project` section', 'commit:\n  title_format: x\n'],
    ['the `project` section has no `scopes` key', 'project:\n  slug: demo\n'],
  ])('reads nothing and warns nothing when %s', async (_case, content) => {
    const root = await writeRoot([], content);

    expect(await readDeclaredScopes(root)).toEqual({ scopeDirs: [], warnings: [] });
  });

  it('throws naming the file when its YAML is malformed', async () => {
    const root = await writeRoot([], 'project: [unclosed\n');

    await expect(readDeclaredScopes(root)).rejects.toThrow(
      `${join(root, '.agents', 'preferences.yaml')}: malformed YAML`,
    );
  });

  it('warns and reads nothing when `project.scopes` is not a list', async () => {
    const root = await writeRoot(['apps/devopticon'], 'project:\n  scopes:\n    path: apps/devopticon\n');

    expect(await readDeclaredScopes(root)).toEqual({
      scopeDirs: [],
      warnings: [`${join(root, '.agents', 'preferences.yaml')}: project.scopes is not a list; ignoring it`],
    });
  });

  it('warns about each faulty entry and still reads the valid one beside it', async () => {
    const root = await writeRoot(['apps/devopticon', 'apps'], '');
    await writeFile(join(root, 'apps', 'README.md'), '', 'utf8');
    const entries = [
      '- apps/devopticon',
      '- name: orphan',
      '- path: 42',
      '- path: apps/devopticon\n  name: ""',
      '- path: /etc',
      '- path: ../elsewhere',
      '- path: apps/missing',
      '- path: apps/README.md',
      '- path: apps/devopticon',
    ];
    await writeFile(
      join(root, '.agents', 'preferences.yaml'),
      `project:\n  scopes:\n${entries.map((entry) => indent(entry)).join('\n')}\n`,
      'utf8',
    );
    const file = join(root, '.agents', 'preferences.yaml');

    expect(await readDeclaredScopes(root)).toEqual({
      scopeDirs: [{ dir: join(root, 'apps/devopticon'), name: 'devopticon' }],
      warnings: [
        `${file}: project.scopes[0] is not a mapping; skipping it`,
        `${file}: project.scopes[1] has no string \`path\`; skipping it`,
        `${file}: project.scopes[2] has no string \`path\`; skipping it`,
        `${file}: project.scopes[3] has a \`name\` that is not a non-empty string; skipping it`,
        `${file}: project.scopes[4] has an absolute path /etc; skipping it`,
        `${file}: project.scopes[5] has a path ../elsewhere outside the repository; skipping it`,
        `${file}: project.scopes[6] has a path apps/missing that does not exist; skipping it`,
        `${file}: project.scopes[7] has a path apps/README.md that is not a directory; skipping it`,
      ],
    });
  });
});

// region | Helpers

/** Indents a YAML list item, including its continuation lines, to sit under `project.scopes`. */
function indent(entry: string): string {
  return entry
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

/** Writes a fixture root holding the given directories and, when given, an `.agents/preferences.yaml` with `content`. */
async function writeRoot(dirs: readonly string[], content: string | undefined): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'read-declared-scopes-'));
  for (const dir of dirs) {
    await mkdir(join(root, dir), { recursive: true });
  }
  if (content !== undefined) {
    await mkdir(join(root, '.agents'), { recursive: true });
    await writeFile(join(root, '.agents', 'preferences.yaml'), content, 'utf8');
  }
  return root;
}

// endregion | Helpers
