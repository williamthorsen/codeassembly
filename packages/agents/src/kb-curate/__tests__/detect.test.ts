import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectFindings } from '../detect.ts';
import { enumerateNotes } from '../enumerate.ts';

const NOW = new Date('2026-05-29T00:00:00Z');

/** Stands up a temp vault with the given note files and an alias map, returning its root. */
async function makeVault(files: Record<string, string>, aliases?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-curate-detect-'));
  await mkdir(join(root, '.kb'), { recursive: true });
  if (aliases !== undefined) {
    await writeFile(join(root, '.kb', 'tag-aliases.yaml'), aliases, 'utf8');
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

async function detectIn(root: string, staleAfterDays = 90) {
  const notes = await enumerateNotes(root);
  return detectFindings({ kbPath: root, notes, now: NOW, staleAfterDays });
}

const CLEAN =
  '---\ntitle: Clean\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\nlast-verified: 2026-05-25\ntags: [git]\n---\n\nA clean note with no defects.\n';

describe(detectFindings, () => {
  it('produces no findings for a clean vault', async () => {
    const root = await makeVault({ 'Clean.md': CLEAN });

    expect(await detectIn(root)).toEqual([]);
  });

  it('reports a frontmatter finding for a missing required field', async () => {
    const root = await makeVault({
      'Bad.md':
        '---\ntitle: Bad\ntype: howto\ncreated: 2026-05-01\nlast-verified: 2026-05-25\ntags: [git]\n---\n\nMissing updated.\n',
    });

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).toContain('frontmatter.required');
  });

  it('reports a tag-alias finding when a tag is an alias', async () => {
    const root = await makeVault(
      {
        'Aliased.md':
          '---\ntitle: Aliased\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\nlast-verified: 2026-05-25\ntags: [vcs]\n---\n\nBody.\n',
      },
      'aliases:\n  git: [vcs]\n',
    );

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).toContain('frontmatter.tag-alias');
  });

  it('reports an unresolved wikilink', async () => {
    const root = await makeVault({ 'Links.md': `${CLEAN}\nSee [[Ghost note]].\n` });

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).toContain('wikilinks.unresolved');
  });

  it('reports a hardcoded user-home path', async () => {
    const root = await makeVault({ 'Paths.md': `${CLEAN}\nRun cd /Users/someone/repos here.\n` });

    const rules = (await detectIn(root)).map((finding) => finding.rule);

    expect(rules).toContain('paths.user-home');
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

  it('sorts findings by path, then line, then rule', async () => {
    const root = await makeVault({
      'b.md': `${CLEAN}\nSee [[Ghost]].\n`,
      'a.md': `${CLEAN}\nSee [[AlsoGhost]].\n`,
    });

    const findings = await detectIn(root);
    const paths = findings.map((finding) => finding.path);

    expect(paths).toEqual([...paths].toSorted());
  });
});
