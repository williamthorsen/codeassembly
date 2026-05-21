import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Frontmatter, ParsedNote } from '../../types.js';
import { parseNoteContent } from '../parse-note.js';
import { writeFrontmatter } from '../write-frontmatter.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

// Fixtures that carry well-formed frontmatter and therefore round-trip.
const ROUND_TRIP_FIXTURES = ['howto-typical.md', 'unusual-whitespace.md', 'with-extra-fields.md'];

/** Parse a fixture and assert its frontmatter parsed, returning the note narrowed. */
async function parseFixture(fixture: string): Promise<ParsedNote & { frontmatter: Frontmatter }> {
  const note = parseNoteContent(await readFile(join(FIXTURES_DIR, fixture), 'utf8'));
  expect(note.frontmatter).not.toBeNull();
  if (note.frontmatter === null) {
    throw new Error(`fixture ${fixture} did not parse frontmatter`);
  }
  return { ...note, frontmatter: note.frontmatter };
}

describe('frontmatter round-trip idempotence', () => {
  it.each(ROUND_TRIP_FIXTURES)(
    'when %s is re-serialized and re-parsed, yields a structurally equal frontmatter',
    async (fixture) => {
      const original = await parseFixture(fixture);

      const rendered = writeFrontmatter({ frontmatter: original.frontmatter, body: original.body });
      const reparsed = parseNoteContent(rendered);

      expect(reparsed.frontmatter).toEqual(original.frontmatter);
    },
  );

  it('renders and re-parses to a stable form across two write cycles', async () => {
    const first = await parseFixture('howto-typical.md');
    const renderedOnce = writeFrontmatter({ frontmatter: first.frontmatter, body: first.body });
    const second = parseNoteContent(renderedOnce);
    expect(second.frontmatter).not.toBeNull();
    if (second.frontmatter === null) throw new Error('second parse lost frontmatter');
    const renderedTwice = writeFrontmatter({ frontmatter: second.frontmatter, body: second.body });

    expect(renderedTwice).toBe(renderedOnce);
  });

  it('preserves optional fields through a round-trip', async () => {
    const original = await parseFixture('with-extra-fields.md');
    const rendered = writeFrontmatter({ frontmatter: original.frontmatter, body: original.body });
    const reparsed = parseNoteContent(rendered);

    expect(reparsed.frontmatter?.extra).toEqual(original.frontmatter.extra);
  });
});
