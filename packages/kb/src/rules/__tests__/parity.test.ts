import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import { parseAliases } from '../../tags/load-aliases.ts';
import { normalizeFindings } from '../../test-utils/scaffolding.ts';
import type { Finding } from '../../types.ts';
import { frontmatterRule } from '../frontmatter-rule.ts';
import { runRules } from '../run-rules.ts';
import { tagAliasRule } from '../tag-alias-rule.ts';

const PARITY_DIR = join(import.meta.dirname, 'fixtures', 'parity');
const NOTES_DIR = join(PARITY_DIR, 'notes');

// `expected-findings.json` is the checked-in golden the `frontmatter` and
// `tag-alias` rules produce over the vendored `notes/` fixtures. It was
// originally captured from the vault's real `check-notes` rules
// (`github.com/williamthorsen/vaults.coding`, commit 128ce97), but the
// `recordType` redesign (#727) intentionally diverges from that legacy `type`
// model, so the golden now reflects the post-redesign kb rules. Upstream parity
// is re-established when vaults.coding#16 lands and the golden is recaptured —
// see `fixtures/parity/README.md` for the procedure. The test still guards
// against silent drift in either direction.
describe('rules golden over the vendored notes fixtures', () => {
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

    expect(normalizeFindings(actual)).toEqual(normalizeFindings(expected));
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
        'frontmatter.recordType',
        'frontmatter.date',
        'frontmatter.tags',
        'frontmatter.tag-alias',
      ]),
    );
  });
});
