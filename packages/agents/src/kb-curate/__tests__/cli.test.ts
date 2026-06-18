import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { check } from '@codeassembly/kb/check';
import { defaultKbConfig, KbLoaderError } from '@codeassembly/kb/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseArgs, runCurate } from '../cli.ts';

// Mock `check` with a passthrough to the real implementation so most tests run
// against real vaults; the error-path tests override it per-call.
vi.mock('@codeassembly/kb/check', async () => {
  const actual = await vi.importActual<typeof import('@codeassembly/kb/check')>('@codeassembly/kb/check');
  return { ...actual, check: vi.fn(actual.check) };
});

const NOW = new Date('2026-05-29T00:00:00Z');

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\nlast-verified: 2026-05-20\ntags: [x]\ntype: howto\n---\n\nBody.\n';

/**
 * Stands up a temp vault with a `.kb/` and an empty home so the registry resolves empty. A note path is written under
 * `content/` so the store's default `targets: ['content/**\/*.md']` enumerates it; a path beginning with `.kb/` is
 * written at the store root so config/schema/alias files land where the loaders read them.
 */
async function makeVault(files: Record<string, string>): Promise<{ kbPath: string; home: string }> {
  const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
  const kbPath = await mkdtemp(join(tmpdir(), 'kb-curate-vault-'));
  await mkdir(join(kbPath, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = relativePath.startsWith('.kb/') ? join(kbPath, relativePath) : join(kbPath, 'content', relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return { kbPath, home };
}

describe(parseArgs, () => {
  it('defaults to report mode with a 90-day threshold', () => {
    expect(parseArgs([])).toEqual({ kb: null, apply: false, staleAfterDays: 90 });
  });

  it('parses --kb, --apply, and --stale-after', () => {
    expect(parseArgs(['--kb', 'coding', '--apply', '--stale-after', '30'])).toEqual({
      kb: 'coding',
      apply: true,
      staleAfterDays: 30,
    });
  });

  it('accepts the inline --stale-after=value form', () => {
    expect(parseArgs(['--stale-after=14'])).toEqual({ kb: null, apply: false, staleAfterDays: 14 });
  });

  it('rejects a non-positive-integer --stale-after', () => {
    expect(() => parseArgs(['--stale-after', '0'])).toThrow(/positive integer/);
    expect(() => parseArgs(['--stale-after', 'abc'])).toThrow(/positive integer/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown flag/);
  });
});

describe(runCurate, () => {
  afterEach(() => {
    vi.mocked(check).mockClear();
  });

  it('returns no-kb-resolvable when no KB can be found and none is requested', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    const startDir = await mkdtemp(join(tmpdir(), 'kb-curate-empty-'));

    const result = await runCurate({ argv: [], startDir, now: NOW, home });

    expect(result).toEqual({ ok: false, error: 'no-kb-resolvable', message: expect.stringContaining('no .kb/') });
  });

  it('returns no-kb-resolvable when --kb names an unregistered KB', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    const startDir = await mkdtemp(join(tmpdir(), 'kb-curate-empty-'));

    const result = await runCurate({ argv: ['--kb', 'ghost'], startDir, now: NOW, home });

    expect(result).toEqual({ ok: false, error: 'no-kb-resolvable', message: expect.stringContaining('"ghost"') });
  });

  it('names the registered KBs and points to --kb @default when run outside a vault', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: primary\nkbs:\n  primary:\n    path: ${home}/primary\n`,
      'utf8',
    );
    const startDir = await mkdtemp(join(tmpdir(), 'kb-curate-empty-'));

    const result = await runCurate({ argv: [], startDir, now: NOW, home });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-kb-resolvable');
      expect(result.message).toContain('primary');
      expect(result.message).toContain('--kb @default');
    }
  });

  it('reports the registry error when --kb @default names an unresolvable default', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: ghost\nkbs:\n  real:\n    path: ${home}/real\n`,
      'utf8',
    );
    const startDir = await mkdtemp(join(tmpdir(), 'kb-curate-empty-'));
    // resolveWritableKb logs the unresolvable-default registry error to stderr; spy so it does not pollute output.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const result = await runCurate({ argv: ['--kb', '@default'], startDir, now: NOW, home });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('no-kb-resolvable');
        expect(result.message).toContain('could not resolve the default');
      }
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('refuses --apply against a readonly KB', async () => {
    const kbPath = await mkdtemp(join(tmpdir(), 'kb-curate-ro-'));
    await mkdir(join(kbPath, '.kb'), { recursive: true });
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(join(home, '.agents', 'kb.yaml'), `kbs:\n  ro:\n    path: ${kbPath}\n    readonly: true\n`, 'utf8');

    const result = await runCurate({ argv: ['--kb', 'ro', '--apply'], startDir: kbPath, now: NOW, home });

    expect(result).toEqual({ ok: false, error: 'readonly-kb', message: expect.stringContaining('readonly') });
  });

  it('reports findings without modifying files in report mode', async () => {
    const { kbPath, home } = await makeVault({ 'Note.md': VALID });

    const result = await runCurate({ argv: [], startDir: kbPath, now: NOW, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('report');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.applied).toBeUndefined();
  });

  it('rewrites a stale path-qualified wikilink under --apply and reports the per-finding outcome', async () => {
    const linking = `${VALID.slice(0, -1)}See [[old/Foo]].\n`;
    const { kbPath, home } = await makeVault({
      'Linker.md': linking,
      'tools/Foo.md': VALID,
    });

    const result = await runCurate({ argv: ['--apply'], startDir: kbPath, now: NOW, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('apply');
    expect(Array.isArray(result.applied)).toBe(true);
    const rewrite = result.applied?.find((fix) => fix.operation === 'rewrite-wikilink');
    expect(rewrite).toMatchObject({ ok: true, operation: 'rewrite-wikilink' });
    const rewritten = await readFile(join(kbPath, 'content', 'Linker.md'), 'utf8');
    expect(rewritten).toContain('[[content/tools/Foo]]');
  });

  it('reports a per-finding failure under --apply when the kb-edit sibling is absent for a tag-alias fix', async () => {
    const aliased = VALID.replace('tags: [x]', 'tags: [todo-item]');
    const { kbPath, home } = await makeVault({
      'Note.md': aliased,
      '.kb/tag-aliases.yaml': 'aliases:\n  todo:\n    - todo-item\n',
    });

    const result = await runCurate({ argv: ['--apply'], startDir: kbPath, now: NOW, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('apply');
    const retag = result.applied?.find((fix) => fix.operation === 'kb-edit --retag');
    expect(retag).toMatchObject({ ok: false, operation: 'kb-edit --retag' });
  });

  it('curates a readonly KB in report mode without refusing', async () => {
    const kbPath = await mkdtemp(join(tmpdir(), 'kb-curate-ro-'));
    await mkdir(join(kbPath, 'content'), { recursive: true });
    await mkdir(join(kbPath, '.kb'), { recursive: true });
    await writeFile(join(kbPath, 'content', 'Note.md'), VALID, 'utf8');
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(join(home, '.agents', 'kb.yaml'), `kbs:\n  ro:\n    path: ${kbPath}\n    readonly: true\n`, 'utf8');

    const result = await runCurate({ argv: ['--kb', 'ro'], startDir: kbPath, now: NOW, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('report');
  });

  it('produces the generic and curate findings together for a content-structured vault', async () => {
    const { kbPath, home } = await makeVault({
      'Bad.md':
        '---\ntitle: Bad\nrecordType: assertion\ncreated: 2026-05-01\nlast-verified: 2026-05-20\ntags: [x]\ntype: howto\n---\n\nSee [[Ghost]].\n',
    });

    const result = await runCurate({ argv: [], startDir: kbPath, now: NOW, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rules = result.findings.map((finding) => finding.rule);
    expect(rules).toContain('frontmatter.required');
    expect(rules).toContain('wikilinks.unresolved');
  });

  it('returns invalid-config when the store config.yaml is malformed', async () => {
    const { kbPath, home } = await makeVault({
      'Note.md': VALID,
      '.kb/config.yaml': 'targets: [unterminated\n',
    });

    const result = await runCurate({ argv: [], startDir: kbPath, now: NOW, home });

    expect(result).toEqual({ ok: false, error: 'invalid-config', message: expect.stringContaining('config.yaml') });
  });

  it('returns invalid-config when the store schema.yaml is malformed', async () => {
    const { kbPath, home } = await makeVault({
      'Note.md': VALID,
      '.kb/schema.yaml': 'types: [howto\n',
    });

    const result = await runCurate({ argv: [], startDir: kbPath, now: NOW, home });

    expect(result).toEqual({ ok: false, error: 'invalid-config', message: expect.stringContaining('schema.yaml') });
  });

  it('propagates a non-loader error from check rather than returning invalid-config', async () => {
    const { kbPath, home } = await makeVault({ 'Note.md': VALID });
    vi.mocked(check).mockRejectedValueOnce(new Error('rule engine crashed'));

    await expect(runCurate({ argv: [], startDir: kbPath, now: NOW, home })).rejects.toThrow(/rule engine crashed/);
  });

  it('returns invalid-config when the residual check after --apply throws a KbLoaderError', async () => {
    const { kbPath, home } = await makeVault({ 'Note.md': VALID });
    // First (pre-apply) check is clean; the residual re-check throws a loader defect (e.g. config corrupted by a race).
    vi.mocked(check)
      .mockResolvedValueOnce({ config: defaultKbConfig, notes: [], findings: [] })
      .mockRejectedValueOnce(new KbLoaderError('config.yaml: malformed YAML'));

    const result = await runCurate({ argv: ['--apply'], startDir: kbPath, now: NOW, home });

    expect(result).toEqual({ ok: false, error: 'invalid-config', message: expect.stringContaining('config.yaml') });
  });
});
