import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Frontmatter, ParsedNote } from '../../types.ts';
import { parseNoteContent } from '../parse-note.ts';
import { writeFrontmatter } from '../write-frontmatter.ts';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

// Fixtures that carry well-formed frontmatter and therefore round-trip.
const ROUND_TRIP_FIXTURES = ['howto-typical.md', 'unusual-whitespace.md', 'with-extra-fields.md'];

/** Parse a fixture and assert its frontmatter parsed, returning the note narrowed. */
async function parseFixture(fixture: string): Promise<ParsedNote & { frontmatter: Frontmatter }> {
  const note = parseNoteContent({ content: await readFile(join(FIXTURES_DIR, fixture), 'utf8') });
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
      const reparsed = parseNoteContent({ content: rendered });

      expect(reparsed.frontmatter).toEqual(original.frontmatter);
    },
  );

  it('renders and re-parses to a stable form across two write cycles', async () => {
    const first = await parseFixture('howto-typical.md');
    const renderedOnce = writeFrontmatter({ frontmatter: first.frontmatter, body: first.body });
    const second = parseNoteContent({ content: renderedOnce });
    expect(second.frontmatter).not.toBeNull();
    if (second.frontmatter === null) throw new Error('second parse lost frontmatter');
    const renderedTwice = writeFrontmatter({ frontmatter: second.frontmatter, body: second.body });

    expect(renderedTwice).toBe(renderedOnce);
  });

  it('preserves optional fields through a round-trip', async () => {
    const original = await parseFixture('with-extra-fields.md');
    const rendered = writeFrontmatter({ frontmatter: original.frontmatter, body: original.body });
    const reparsed = parseNoteContent({ content: rendered });

    expect(reparsed.frontmatter?.extra).toEqual(original.frontmatter.extra);
  });

  it.each(['null', '~', 'true', 'false'])(
    'preserves a string field whose value is the YAML reserved keyword %s',
    (keyword) => {
      const frontmatter: Frontmatter = {
        title: keyword,
        recordType: 'assertion',
        created: '2026-05-01',
        updated: '2026-05-14',
        tags: [],
        extra: {},
      };

      const rendered = writeFrontmatter({ frontmatter, body: '' });
      const reparsed = parseNoteContent({ content: rendered });

      expect(reparsed.frontmatter?.title).toBe(keyword);
    },
  );

  // A string value placed in `extra` bypasses `stringValue`'s number-to-string
  // coercion on re-read, so it is where unquoted numeric- or keyword-looking
  // strings actually corrupt: the YAML core schema re-parses them as numbers,
  // booleans, or null unless `renderScalar` quotes them.
  it.each([
    '42',
    '-7',
    '+13',
    '0',
    '1.5',
    '-0.25',
    '1e3',
    '1E-4',
    '.5',
    '.inf',
    '.Inf',
    '.INF',
    '-.inf',
    '.nan',
    '.NaN',
    '.NAN',
    'null',
    '~',
    'true',
    'false',
  ])('preserves a string-typed extra field whose value is the YAML-ambiguous literal %s', (literal) => {
    const frontmatter: Frontmatter = {
      title: 'a note',
      recordType: 'assertion',
      created: '2026-05-01',
      updated: '2026-05-14',
      tags: [],
      extra: { token: literal },
    };

    const rendered = writeFrontmatter({ frontmatter, body: '' });
    const reparsed = parseNoteContent({ content: rendered });

    expect(reparsed.frontmatter?.extra.token).toBe(literal);
  });

  // A string containing a literal newline would, under a single-quoted YAML
  // scalar, fold its embedded newlines (a single `\n` becomes a space, blank
  // lines collapse). `renderScalar` must emit such values as double-quoted
  // scalars whose `\n` escapes both stay on one line and re-parse exactly.
  it.each([
    ['a single embedded newline', 'first\nsecond'],
    ['a blank line', 'a\n\nb'],
    ['leading and trailing newlines', '\nedge\n'],
  ])('preserves a multi-line string-typed extra field with %s', (_label, value) => {
    const frontmatter: Frontmatter = {
      title: 'a note',
      recordType: 'assertion',
      created: '2026-05-01',
      updated: '2026-05-14',
      tags: [],
      extra: { note: value },
    };

    const rendered = writeFrontmatter({ frontmatter, body: '' });
    const reparsed = parseNoteContent({ content: rendered });

    expect(reparsed.frontmatter?.extra.note).toBe(value);
  });

  // `renderExtraEntry`'s non-string branches. A numeric `extra` value must
  // route through `yaml.stringify`, not `String()`: `String(Infinity)` emits
  // `Infinity`, which the YAML core schema re-parses as the string "Infinity".
  it.each([42, -7, 0, 1.5, -0.25, 1000, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
    'preserves a numeric extra field whose value is %s',
    (count) => {
      const frontmatter: Frontmatter = {
        title: 'a note',
        recordType: 'assertion',
        created: '2026-05-01',
        updated: '2026-05-14',
        tags: [],
        extra: { count },
      };

      const rendered = writeFrontmatter({ frontmatter, body: '' });
      const reparsed = parseNoteContent({ content: rendered });

      expect(reparsed.frontmatter?.extra.count).toBe(count);
    },
  );

  it.each([true, false])('preserves a boolean extra field whose value is %s', (flag) => {
    const frontmatter: Frontmatter = {
      title: 'a note',
      recordType: 'assertion',
      created: '2026-05-01',
      updated: '2026-05-14',
      tags: [],
      extra: { flag },
    };

    const rendered = writeFrontmatter({ frontmatter, body: '' });
    const reparsed = parseNoteContent({ content: rendered });

    expect(reparsed.frontmatter?.extra.flag).toBe(flag);
  });

  it('preserves a null extra field', () => {
    const frontmatter: Frontmatter = {
      title: 'a note',
      recordType: 'assertion',
      created: '2026-05-01',
      updated: '2026-05-14',
      tags: [],
      extra: { maybe: null },
    };

    const rendered = writeFrontmatter({ frontmatter, body: '' });
    const reparsed = parseNoteContent({ content: rendered });

    expect(reparsed.frontmatter?.extra.maybe).toBeNull();
  });

  it('preserves a structured extra field through the yaml serializer', () => {
    const meta = { nested: 'value', count: 3, flags: [true, false] };
    const frontmatter: Frontmatter = {
      title: 'a note',
      recordType: 'assertion',
      created: '2026-05-01',
      updated: '2026-05-14',
      tags: [],
      extra: { meta },
    };

    const rendered = writeFrontmatter({ frontmatter, body: '' });
    const reparsed = parseNoteContent({ content: rendered });

    expect(reparsed.frontmatter?.extra.meta).toEqual(meta);
  });
});
