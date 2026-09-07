import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enumerateNotes } from '@williamthorsen/kb/check';
import { defaultKbConfig } from '@williamthorsen/kb/config';
import { describe, expect, it } from 'vitest';

import { detectCurateFindings, sortFindings } from '../detect.ts';

const NOW = new Date('2026-05-29T00:00:00Z');

/** Stands up a temp vault, writing each file under `content/` so the default targets enumerate it. */
async function makeVault(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-curate-detect-'));
  await mkdir(join(root, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, 'content', relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

/** Enumerates a vault under the default targets and runs the curate-only detectors. */
async function detectIn(root: string, staleAfterDays = 90) {
  const notes = await enumerateNotes({ kbRoot: root, config: defaultKbConfig });
  return detectCurateFindings({ notes, now: NOW, staleAfterDays });
}

const CLEAN =
  '---\ntitle: Clean\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\nlast-verified: 2026-05-25\ntags: [git]\n---\n\nA clean note with no defects.\n';

describe(detectCurateFindings, () => {
  it('produces no curate findings for a clean vault', async () => {
    const root = await makeVault({ 'Clean.md': CLEAN });

    expect(await detectIn(root)).toEqual([]);
  });

  it('reports no verification.unmarked findings when no note uses verification', async () => {
    const root = await makeVault({
      'A.md': '---\ntitle: A\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [git]\n---\n\nBody.\n',
      'B.md': '---\ntitle: B\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [git]\n---\n\nBody.\n',
    });

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).not.toContain('verification.unmarked');
  });

  it('reports verification.unmarked for unmarked notes when some note uses verification', async () => {
    const root = await makeVault({
      'Marked.md': CLEAN,
      'Unmarked.md':
        '---\ntitle: Unmarked\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [git]\n---\n\nBody.\n',
    });

    const unmarked = (await detectIn(root)).filter((finding) => finding.rule === 'verification.unmarked');

    expect(unmarked).toHaveLength(1);
    expect(unmarked[0]?.path.endsWith('Unmarked.md')).toBe(true);
  });

  it('reports verification staleness past the threshold', async () => {
    const root = await makeVault({
      'Stale.md':
        '---\ntitle: Stale\ntype: howto\ncreated: 2026-01-01\nupdated: 2026-01-01\nlast-verified: 2026-01-01\ntags: [git]\n---\n\nBody.\n',
    });

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).toContain('verification.stale');
  });

  it('reports a dangling supersede target', async () => {
    const root = await makeVault({
      'Old.md':
        '---\ntitle: Old\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\nlast-verified: 2026-05-25\ntags: [git]\nsuperseded-by: Missing.md\n---\n\nBody.\n',
    });

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).toContain('supersede.dangling');
  });
});

describe(sortFindings, () => {
  it('sorts findings by path, then line, then rule', () => {
    const findings = sortFindings([
      { path: 'b.md', rule: 'z.rule', severity: 'error', message: 'm' },
      { path: 'a.md', line: 5, rule: 'a.rule', severity: 'error', message: 'm' },
      { path: 'a.md', line: 2, rule: 'b.rule', severity: 'warning', message: 'm' },
    ]);

    expect(findings.map((finding) => `${finding.path}:${finding.line ?? 0}:${finding.rule}`)).toEqual([
      'a.md:2:b.rule',
      'a.md:5:a.rule',
      'b.md:0:z.rule',
    ]);
  });
});
