import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { check } from '../../check/check.ts';
import {
  commitAll,
  getRegistryPathFor,
  initGitRepo,
  makeStore,
  makeTempDir,
  seedRegistry,
} from '../../test-utils/scaffolding.ts';
import { run } from '../run.ts';

// Mock `check` with a passthrough to the real implementation so most tests run
// against real stores; the non-loader-error pass-through test overrides it per-call.
vi.mock('../../check/check.ts', async () => {
  const actual = await vi.importActual<typeof import('../../check/check.ts')>('../../check/check.ts');
  return { ...actual, check: vi.fn(actual.check) };
});

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';
const MISSING_UPDATED = '---\ntitle: Bad\nrecordType: assertion\ncreated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(run, () => {
  afterEach(() => {
    vi.mocked(check).mockClear();
  });

  it('exits 0 with a clean-run line when there are no findings', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('✓ no findings (1 notes checked)\n');
  });

  it('exits 1 when an error-severity finding is present', async () => {
    const store = await makeStore({ 'content/Bad.md': MISSING_UPDATED });

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('frontmatter.required');
  });

  it('exits 0 without the clean-run check when no notes match the targets', async () => {
    const store = await makeStore({ 'Loose.md': VALID });

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('no notes matched content/**/*.md (0 checked)\n');
    expect(result.stdout).not.toContain('✓');
  });

  it('exits 2 for an unknown flag', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });

    const result = await run({ argv: ['check', '--nope'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown flag: --nope');
  });

  it('exits 2 when no .kb/ directory is found and no --kb is given', async () => {
    const empty = await makeTempDir('kb-cli-empty-');

    const result = await run({ argv: ['check'], cwd: empty });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('no .kb/');
  });

  it('exits 2 when --kb names an unregistered store', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });
    const home = await makeHome('coding', store);

    const result = await run({ argv: ['check', '--kb', 'ghost'], cwd: store, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('"ghost"');
  });

  it('exits 2 when config.yaml is malformed', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });
    await writeFile(join(store, '.kb', 'config.yaml'), 'targets: [unterminated\n', 'utf8');

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('config.yaml');
  });

  it('exits 2 when tag-aliases.yaml is malformed', async () => {
    const store = await makeStore({
      'content/Clean.md': VALID,
      '.kb/tag-aliases.yaml': 'aliases: [unterminated\n',
    });

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('tag-aliases.yaml');
  });

  it('exits 0 with the warning shown when only warning-severity findings are present', async () => {
    const aliased = VALID.replace('tags: [x]', 'tags: [vcs]');
    const store = await makeStore({
      'content/Aliased.md': aliased,
      '.kb/tag-aliases.yaml': 'aliases:\n  git: [vcs]\n',
    });

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('warning frontmatter.tag-alias');
  });

  it('resolves a store by --kb from the registry and emits the JSON shape', async () => {
    const store = await makeStore({ 'content/Bad.md': MISSING_UPDATED });
    const home = await makeHome('coding', store);

    const result = await run({ argv: ['check', '--kb', 'coding', '--json'], cwd: store, home });

    expect(result.exitCode).toBe(1);
    const payload: unknown = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      store: { name: 'coding', path: store },
      summary: { notes: 1, total: 1, errors: 1, warnings: 0 },
    });
  });

  it('resolves a store from a project-local registry entry', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });
    const project = await makeTempDir('kb-cli-project-');
    await seedRegistry(getRegistryPathFor(project), `kbs:\n  local:\n    path: ${store}\n`);
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['check', '--kb', 'local'], cwd: project, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('✓ no findings');
  });

  it('groups findings by file with severity, rule, and line in human output', async () => {
    const store = await makeStore({ 'content/Bad.md': MISSING_UPDATED });

    const result = await run({ argv: ['check'], cwd: store });

    expect(result.stdout).toContain(join(store, 'content', 'Bad.md'));
    expect(result.stdout).toMatch(/error frontmatter\.required \(line \d+\): /);
  });

  it('does not write files during a check', async () => {
    const store = await makeStore({ 'content/Note.md': VALID });
    const before = await readFile(join(store, 'content', 'Note.md'), 'utf8');

    await run({ argv: ['check'], cwd: store });

    expect(await readFile(join(store, 'content', 'Note.md'), 'utf8')).toBe(before);
  });

  it('prints top-level help for a bare invocation', async () => {
    const result = await run({ argv: [], cwd: tmpdir() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: kb <command>');
  });

  it('prints check help for check --help', async () => {
    const result = await run({ argv: ['check', '--help'], cwd: tmpdir() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: kb check');
  });

  it('exits 2 for an unknown command', async () => {
    const result = await run({ argv: ['frobnicate'], cwd: tmpdir() });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown command');
  });

  it('propagates a non-loader error from check rather than swallowing it as a config error', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });
    vi.mocked(check).mockRejectedValueOnce(new Error('rule engine crashed'));

    await expect(run({ argv: ['check'], cwd: store })).rejects.toThrow(/rule engine crashed/);
  });
});

describe('kb check targeting', () => {
  it('validates only the notes matched by a path argument', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID, 'content/Bad.md': MISSING_UPDATED });

    const whole = await run({ argv: ['check'], cwd: store });
    const scoped = await run({ argv: ['check', 'content/Clean.md'], cwd: store });

    expect(whole.exitCode).toBe(1);
    expect(scoped.exitCode).toBe(0);
    expect(scoped.stdout).toContain('1 notes checked');
  });

  it('validates only the notes beneath a directory argument', async () => {
    const store = await makeStore({ 'content/sub/Clean.md': VALID, 'content/Bad.md': MISSING_UPDATED });

    const result = await run({ argv: ['check', 'content/sub'], cwd: store });

    expect(result.exitCode).toBe(0);
  });

  it('exits 2 naming a path that matches no note', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });

    const result = await run({ argv: ['check', 'content/Ghost.md'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('content/Ghost.md');
  });

  it('exits 2 when path arguments and --vs are combined', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });

    const result = await run({ argv: ['check', 'content/Clean.md', '--vs=HEAD'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--vs');
  });

  it('exits 2 when --vs is given without a ref', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });

    const result = await run({ argv: ['check', '--vs'], cwd: store });

    expect(result.exitCode).toBe(2);
  });

  it('prints a targeted empty-selection line distinct from the whole-vault line', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID, 'content/assets/logo.png': 'x' });

    const result = await run({ argv: ['check', 'content/assets'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('no notes matched the given paths');
    expect(result.stdout).not.toContain('content/**/*.md');
  });

  it('reflects the selected count in the JSON summary for a path argument', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID, 'content/Bad.md': MISSING_UPDATED });

    const result = await run({ argv: ['check', 'content/Bad.md', '--json'], cwd: store });
    const payload: unknown = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(payload).toMatchObject({ summary: { notes: 1, errors: 1 } });
  });

  it('validates only the notes changed since a ref', async () => {
    const store = await makeStore({ 'content/BadUnchanged.md': MISSING_UPDATED });
    initGitRepo(store);
    const base = commitAll(store, 'base');
    await writeFile(join(store, 'content', 'GoodChanged.md'), VALID, 'utf8');
    commitAll(store, 'add a clean note');

    const whole = await run({ argv: ['check'], cwd: store });
    const scoped = await run({ argv: ['check', `--vs=${base}`], cwd: store });

    expect(whole.exitCode).toBe(1);
    expect(scoped.exitCode).toBe(0);
  });

  it('exits 2 for an unresolvable --vs ref', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });
    initGitRepo(store);
    commitAll(store, 'base');

    const result = await run({ argv: ['check', '--vs=no-such-ref'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('no-such-ref');
  });

  it('composes --kb with a path argument, narrowing within the named store', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID, 'content/Bad.md': MISSING_UPDATED });
    const home = await makeHome('coding', store);

    const whole = await run({ argv: ['check', '--kb', 'coding'], cwd: store, home });
    const scoped = await run({ argv: ['check', '--kb', 'coding', 'content/Clean.md'], cwd: store, home });

    expect(whole.exitCode).toBe(1);
    expect(scoped.exitCode).toBe(0);
  });

  it('checks only the changed metacharacter-named note, not its glob-expanded siblings', async () => {
    // `Draft2.md` is unchanged and erroring; as a glob, `Draft[v2].md` would also match it, so a
    // `--vs` run that touched only the clean `Draft[v2].md` must not be failed by the sibling.
    const store = await makeStore({ 'content/Draft2.md': MISSING_UPDATED });
    initGitRepo(store);
    const base = commitAll(store, 'base');
    await writeFile(join(store, 'content', 'Draft[v2].md'), VALID, 'utf8');
    commitAll(store, 'add the metachar-named note');

    const result = await run({ argv: ['check', `--vs=${base}`], cwd: store });

    expect(result.exitCode).toBe(0);
  });

  it('checks a changed note with a non-ASCII name', async () => {
    const store = await makeStore({ 'content/Clean.md': VALID });
    initGitRepo(store);
    const base = commitAll(store, 'base');
    await writeFile(join(store, 'content', 'Café.md'), MISSING_UPDATED, 'utf8');
    commitAll(store, 'add a non-ascii note');

    const result = await run({ argv: ['check', `--vs=${base}`], cwd: store });

    expect(result.exitCode).toBe(1);
  });
});

// region | Helpers

/** Stands up an isolated home registering `name → storePath` in `~/.agents/kb.yaml`; returns the home dir. */
async function makeHome(name: string, storePath: string): Promise<string> {
  const home = await makeTempDir('kb-cli-home-');
  await seedRegistry(getRegistryPathFor(home), `kbs:\n  ${name}:\n    path: ${storePath}\n`);
  return home;
}

// endregion | Helpers
