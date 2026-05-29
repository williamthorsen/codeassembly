import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import type { Finding } from '../../types.ts';
import { pathsRule } from '../paths-rule.ts';
import { runRules } from '../run-rules.ts';
import { wikilinksRule } from '../wikilinks-rule.ts';

const PARITY_DIR = join(import.meta.dirname, 'fixtures', 'parity-cross-note');
const NOTES_DIR = join(PARITY_DIR, 'notes');

/** Sort findings by path, then line, then rule, for stable comparison. */
function normalize(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule === b.rule) return 0;
    return a.rule < b.rule ? -1 : 1;
  });
}

/** Recursively collect vault-relative `.md` paths under `dir`, skipping dot-dirs and `node_modules`. */
async function collectNotePaths(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectNotePaths(root, full)));
    } else if (entry.name.endsWith('.md')) {
      paths.push(relative(root, full).split(sep).join('/'));
    }
  }
  return paths;
}

// `expected-findings.json` is captured from the vault's real `check-notes` `wikilinks` and `paths` rules
// (`github.com/williamthorsen/vaults.coding`) run over this directory's `notes/` mini-vault. It is kept entirely
// separate from the `frontmatter`/`tag-alias` parity golden in `fixtures/parity/`, so this proof and that one
// never interfere. See `fixtures/parity-cross-note/README.md` for the capture procedure.
describe('cross-note rules parity proof against the real check-notes golden', () => {
  it('produces exactly the wikilinks/paths findings recorded in expected-findings.json', async () => {
    const expected: Finding[] = JSON.parse(await readFile(join(PARITY_DIR, 'expected-findings.json'), 'utf8'));

    const relPaths = (await collectNotePaths(NOTES_DIR, NOTES_DIR)).toSorted();
    const notes = await Promise.all(
      relPaths.map(async (rel) =>
        parseNoteContent({ content: await readFile(join(NOTES_DIR, rel), 'utf8'), path: rel }),
      ),
    );

    const actual = runRules({
      rules: [wikilinksRule, pathsRule],
      notes,
      schema: defaultSchema,
    });

    expect(normalize(actual)).toEqual(normalize(expected));
  });

  it('exercises both cross-note rule codes in the golden', async () => {
    const expected: Finding[] = JSON.parse(await readFile(join(PARITY_DIR, 'expected-findings.json'), 'utf8'));
    const codes = new Set(expected.map((finding) => finding.rule));

    expect(codes).toEqual(new Set(['wikilinks.unresolved', 'wikilinks.ambiguous', 'paths.user-home']));
  });
});
