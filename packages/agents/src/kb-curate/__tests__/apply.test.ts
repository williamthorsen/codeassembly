import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enumerateNotes } from '@codeassembly/kb/check';
import { defaultKbConfig } from '@codeassembly/kb/config';
import { describe, expect, it } from 'vitest';

import { applyFixes } from '../apply.ts';

const ORIGINAL_FRONTMATTER =
  '---\ntitle: A\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [todo-item]\n---\n';
const CANONICALIZED_FRONTMATTER =
  '---\ntitle: A\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [todo]\n---\n';
const TARGET = '---\ntitle: Foo\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

/** Stands up a temp vault with a `.kb/`, writing each note under `content/` so the default targets enumerate it. */
async function makeVault(files: Record<string, string>): Promise<string> {
  const kbPath = await mkdtemp(join(tmpdir(), 'kb-curate-apply-'));
  await mkdir(join(kbPath, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(kbPath, 'content', relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return kbPath;
}

/** Enumerates a vault's notes under the default targets. */
async function enumerate(kbPath: string) {
  return enumerateNotes({ kbRoot: kbPath, config: defaultKbConfig });
}

describe(applyFixes, () => {
  // Regression: the inline wikilink writer must operate on current on-disk state, not the enumeration snapshot.
  // A tag canonicalization that ran first rewrites the frontmatter on disk; writing the body rewrite from the stale
  // snapshot would silently revert that frontmatter and still report ok:true. This simulates the prior frontmatter
  // write by mutating the file on disk after enumeration, then asserts the wikilink rewrite preserves it.
  it('preserves an on-disk frontmatter change made after enumeration when rewriting the body', async () => {
    const linker = `${ORIGINAL_FRONTMATTER}\nSee [[old/Foo]].\n`;
    const kbPath = await makeVault({ 'Linker.md': linker, 'tools/Foo.md': TARGET });
    const notes = await enumerate(kbPath);

    // Simulate the tag fix having rewritten the frontmatter on disk (kb-edit, the sole frontmatter writer).
    const linkerPath = join(kbPath, 'content', 'Linker.md');
    await writeFile(linkerPath, `${CANONICALIZED_FRONTMATTER}\nSee [[old/Foo]].\n`, 'utf8');

    const fixes = await applyFixes({ kbPath, notes, findings: [] });

    const onDisk = await readFile(linkerPath, 'utf8');
    expect(onDisk).toContain('tags: [todo]'); // the on-disk frontmatter change is preserved, not clobbered
    expect(onDisk).not.toContain('tags: [todo-item]');
    expect(onDisk).toContain('[[content/tools/Foo]]'); // the body rewrite landed against the content-scoped path
    const rewrite = fixes.find((fix) => fix.operation === 'rewrite-wikilink');
    expect(rewrite).toMatchObject({ ok: true });
  });

  it('reports ok:false without writing when the body anchor is not found on disk', async () => {
    const linker = `${ORIGINAL_FRONTMATTER}\nSee [[old/Foo]].\n`;
    const kbPath = await makeVault({ 'Linker.md': linker, 'tools/Foo.md': TARGET });
    const notes = await enumerate(kbPath);

    // Replace the body on disk so the snapshot's body no longer anchors in the current content.
    const linkerPath = join(kbPath, 'content', 'Linker.md');
    await writeFile(linkerPath, `${ORIGINAL_FRONTMATTER}\nEntirely different body.\n`, 'utf8');

    const fixes = await applyFixes({ kbPath, notes, findings: [] });

    const rewrite = fixes.find((fix) => fix.operation === 'rewrite-wikilink');
    expect(rewrite).toMatchObject({ ok: false });
    const onDisk = await readFile(linkerPath, 'utf8');
    expect(onDisk).toContain('Entirely different body.'); // untouched — no frontmatter-stripped write
  });
});
