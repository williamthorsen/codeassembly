import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, runCurate } from '../cli.ts';

const NOW = new Date('2026-05-29T00:00:00Z');

const VALID =
  '---\ntitle: A\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\nlast-verified: 2026-05-20\ntags: [x]\n---\n\nBody.\n';

/** Stands up a temp vault with a `.kb/` and the given note files, plus an empty home so the registry resolves empty. */
async function makeVault(files: Record<string, string>): Promise<{ kbPath: string; home: string }> {
  const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
  const kbPath = await mkdtemp(join(tmpdir(), 'kb-curate-vault-'));
  await mkdir(join(kbPath, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(kbPath, relativePath);
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

  it('curates a readonly KB in report mode without refusing', async () => {
    const kbPath = await mkdtemp(join(tmpdir(), 'kb-curate-ro-'));
    await mkdir(join(kbPath, '.kb'), { recursive: true });
    await writeFile(join(kbPath, 'Note.md'), VALID, 'utf8');
    const home = await mkdtemp(join(tmpdir(), 'kb-curate-home-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(join(home, '.agents', 'kb.yaml'), `kbs:\n  ro:\n    path: ${kbPath}\n    readonly: true\n`, 'utf8');

    const result = await runCurate({ argv: ['--kb', 'ro'], startDir: kbPath, now: NOW, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('report');
  });
});
