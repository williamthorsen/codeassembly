import { describe, expect, it } from 'vitest';

import { commitAll, initGitRepo } from '../../test-utils/git-repo.ts';
import { makeStore } from '../../test-utils/make-store.ts';
import { check } from '../check.ts';

const LINKS_TO_SCRATCH =
  '---\ntitle: Kept\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nSee [[Scratch]].\n';

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(`${check.name} under git`, () => {
  it('drops a gitignored note as a wikilink target, so a link pointing at it goes unresolved', async () => {
    const root = await makeStore({
      '.gitignore': 'local/\n',
      'content/Kept.md': LINKS_TO_SCRATCH,
      'content/local/Scratch.md': VALID,
    });
    initGitRepo(root);
    commitAll(root, 'base');

    const result = await check({ kbRoot: root });

    expect(result.notes.map((note) => note.relativePath)).toEqual(['content/Kept.md']);
    expect(result.findings.map((finding) => finding.rule)).toContain('wikilinks.unresolved');
  });
});
