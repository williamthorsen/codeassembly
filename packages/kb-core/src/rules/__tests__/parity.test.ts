import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import { parseAliases } from '../../tags/load-aliases.ts';
import type { Finding } from '../../types.ts';
import { frontmatterRule } from '../frontmatter-rule.ts';
import { runRules } from '../run-rules.ts';
import { tagAliasRule } from '../tag-alias-rule.ts';

const PARITY_DIR = join(import.meta.dirname, 'fixtures', 'parity');
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

// `expected-findings.json` is captured from the vault's real `check-notes`
// rules (`github.com/williamthorsen/vaults.coding`, commit 128ce97) run over
// the vendored `notes/` fixtures. Because the golden is the upstream rules'
// own output, this test is a genuine parity proof: kb-core's ported rules must
// reproduce it exactly. It also guards against future drift in either
// direction — see `fixtures/parity/README.md` for the capture procedure.
describe('rules parity proof against the real check-notes golden', () => {
  it('produces exactly the findings recorded in expected-findings.json', async () => {
    const expected: Finding[] = JSON.parse(await readFile(join(PARITY_DIR, 'expected-findings.json'), 'utf8'));
    const aliases = parseAliases(await readFile(join(PARITY_DIR, 'tag-aliases.yaml'), 'utf8'));

    const noteFiles = (await readdir(NOTES_DIR)).filter((name) => name.endsWith('.md')).toSorted();
    const notes = await Promise.all(
      noteFiles.map(async (name) =>
        parseNoteContent({ content: await readFile(join(NOTES_DIR, name), 'utf8'), path: name }),
      ),
    );

    const actual = runRules({
      rules: [frontmatterRule, tagAliasRule],
      notes,
      schema: defaultSchema,
      aliases,
    });

    expect(normalize(actual)).toEqual(normalize(expected));
  });

  it('exercises every frontmatter rule code in the golden', async () => {
    const expected: Finding[] = JSON.parse(await readFile(join(PARITY_DIR, 'expected-findings.json'), 'utf8'));
    const codes = new Set(expected.map((finding) => finding.rule));

    expect(codes).toEqual(
      new Set([
        'frontmatter.missing',
        'frontmatter.parse',
        'frontmatter.empty',
        'frontmatter.required',
        'frontmatter.type',
        'frontmatter.date',
        'frontmatter.tags',
        'frontmatter.tag-alias',
      ]),
    );
  });
});
