import { describe, expect, it } from 'vitest';

import { parseRulebookFile } from '../rulebook-schema.ts';

/** The rejection required for an unrecognized delivery mode: naming the permitted set, not a bare "Invalid input". */
const DELIVERY_MESSAGE = "delivery must be 'ambient', 'hook', or 'skill', or a non-empty list of them";

/** The rejection required for an omitted delivery, distinct from the malformed-value message. */
const DELIVERY_MISSING_MESSAGE =
  "delivery is required: declare 'ambient', 'hook', or 'skill', or a non-empty list of them";

/** The rejection required for a non-string version: naming quoting as the fix, not a bare "Invalid input". */
const VERSION_TYPE_MESSAGE = "version must be quoted (e.g. version: '1.10'); unquoted, 1.10 is read as the number 1.1";

/**
 * The rejection required for a version that cannot be rendered on its deployed line, distinct from the quoting
 * message.
 */
const VERSION_SHAPE_MESSAGE = "version must be a non-blank single line that does not contain '-->'";

/** Wraps frontmatter and a body into a rulebook source file. */
function rulebookFile(frontmatter: string, body = '# Shell conventions\n\nUse strict mode.'): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

describe(parseRulebookFile, () => {
  it('parses the operational fields from valid frontmatter', () => {
    const { rulebook } = parseRulebookFile(
      rulebookFile("slug: shell-conventions\ndescription: Shell rules\ndelivery: ambient\nversion: '1'"),
    );

    expect(rulebook.slug).toBe('shell-conventions');
    expect(rulebook.description).toBe('Shell rules');
    expect(rulebook.delivery).toEqual(['ambient']);
    expect(rulebook.version).toBe('1');
  });

  it('returns the body with the frontmatter stripped', () => {
    const { body } = parseRulebookFile(rulebookFile('slug: shell-conventions\ndelivery: skill'));

    expect(body).toContain('# Shell conventions');
    expect(body).not.toContain('slug:');
  });

  it('when delivery is a list, normalizes it to an array', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, skill]'));

    expect(rulebook.delivery).toEqual(['ambient', 'skill']);
  });

  it('rejects a rulebook that omits delivery, naming the field as required', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x'), 'rulebooks/x.md')).toThrow(
      `Invalid rulebook frontmatter in rulebooks/x.md: delivery: ${DELIVERY_MISSING_MESSAGE}`,
    );
  });

  it('accepts hook as the only delivery mode', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\ndelivery: hook'));

    expect(rulebook.delivery).toEqual(['hook']);
  });

  it('accepts hook alongside the modes on which the resolver acts', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, hook, skill]'));

    expect(rulebook.delivery).toEqual(['ambient', 'hook', 'skill']);
  });

  it('throws when a delivery list is empty, which would not name any delivery mode', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: []'))).toThrow(DELIVERY_MESSAGE);
  });

  it('throws when delivery names a mode on which the resolver does not act', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: skil'))).toThrow(DELIVERY_MESSAGE);
  });

  it('throws when a delivery list contains a mode on which the resolver does not act', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, skil]'))).toThrow(DELIVERY_MESSAGE);
  });

  it('reads a quoted version verbatim, keeping the digits that an unquoted one would lose', () => {
    const { rulebook } = parseRulebookFile(rulebookFile("slug: x\ndelivery: skill\nversion: '1.10'"));

    expect(rulebook.version).toBe('1.10');
  });

  it.each([
    ['a number', 'version: 3'],
    ['a decimal that loses a digit', 'version: 1.10'],
    ['an empty value, which YAML reads as null', 'version:'],
    ['a boolean', 'version: true'],
  ])('throws on %s version, naming quoting as the fix', (_label, declaration) => {
    expect(() => parseRulebookFile(rulebookFile(`slug: x\ndelivery: skill\n${declaration}`))).toThrow(
      VERSION_TYPE_MESSAGE,
    );
  });

  it.each([
    ['blank', "version: '   '"],
    ['multi-line', String.raw`version: "1\n2"`],
    ['closing the comment into which it is rendered', "version: 'a --> b'"],
  ])('throws on a %s version, naming the shape required by the deployed line', (_label, declaration) => {
    expect(() => parseRulebookFile(rulebookFile(`slug: x\ndelivery: skill\n${declaration}`))).toThrow(
      VERSION_SHAPE_MESSAGE,
    );
  });

  it('tolerates unknown classification fields without throwing', () => {
    const { rulebook } = parseRulebookFile(
      rulebookFile('slug: shell-conventions\ndelivery: skill\nlanguages: [bash]\ntags: [shell, style]'),
    );

    expect(rulebook.slug).toBe('shell-conventions');
  });

  it('parses a skill-name override', () => {
    const { rulebook } = parseRulebookFile(
      rulebookFile('slug: shell-conventions\ndelivery: skill\nskill-name: shell-conventions-rulebook'),
    );

    expect(rulebook['skill-name']).toBe('shell-conventions-rulebook');
  });

  it('when skill-name is omitted, leaves it undefined', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: shell-conventions\ndelivery: skill'));

    expect(rulebook['skill-name']).toBeUndefined();
  });

  it('throws when skill-name is not kebab-case', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: skill\nskill-name: Not_Kebab'))).toThrow(
      /skill-name/,
    );
  });

  it('throws when slug is missing', () => {
    expect(() => parseRulebookFile(rulebookFile('description: no slug here'))).toThrow(/slug/);
  });

  it('throws when slug is not kebab-case', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: Shell_Conventions\ndelivery: skill'))).toThrow(/slug/);
  });

  it.each([
    ['a single harness id', 'supported-harnesses: claude', ['claude']],
    ['a list of harness ids', 'supported-harnesses: [claude, rovo]', ['claude', 'rovo']],
    ['an empty list', 'supported-harnesses: []', undefined],
    ['an empty value, which YAML reads as null', 'supported-harnesses:', undefined],
    ['an absent key', '', undefined],
  ])('normalizes %s in supported-harnesses', (_label, declaration, expected) => {
    const { rulebook } = parseRulebookFile(rulebookFile(`slug: x\ndelivery: skill\n${declaration}`));

    expect(rulebook['supported-harnesses']).toEqual(expected);
  });

  it('throws on an unknown harness id, naming the file, the value, and the known ids', () => {
    expect(() =>
      parseRulebookFile(
        rulebookFile('slug: x\ndelivery: skill\nsupported-harnesses: [claude, codex]'),
        'rulebooks/x.md',
      ),
    ).toThrow(
      'Invalid rulebook frontmatter in rulebooks/x.md: supported-harnesses: unknown harness "codex"; known harnesses are claude, rovo',
    );
  });

  it('names the source in the error when validation fails', () => {
    expect(() => parseRulebookFile(rulebookFile('description: no slug'), 'rulebooks/bad.md')).toThrow(
      /rulebooks\/bad\.md/,
    );
  });
});
