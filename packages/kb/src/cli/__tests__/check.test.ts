import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { check } from '../../check/check.ts';
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

/** Stands up a temp store with a `.kb/` and the given files; returns its path. */
async function makeStore(files: Record<string, string>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'kb-cli-store-'));
  await mkdir(join(path, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(path, relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return path;
}

/** Stands up an isolated home registering `name → storePath` in `~/.agents/kb.yaml`; returns the home dir. */
async function makeHome(name: string, storePath: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'kb-cli-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(join(home, '.agents', 'kb.yaml'), `kbs:\n  ${name}:\n    path: ${storePath}\n`, 'utf8');
  return home;
}

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
    const empty = await mkdtemp(join(tmpdir(), 'kb-cli-empty-'));

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
    const project = await mkdtemp(join(tmpdir(), 'kb-cli-project-'));
    await mkdir(join(project, '.agents'), { recursive: true });
    await writeFile(join(project, '.agents', 'kb.yaml'), `kbs:\n  local:\n    path: ${store}\n`, 'utf8');
    const home = await mkdtemp(join(tmpdir(), 'kb-cli-home-'));

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
