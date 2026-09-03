import { describe, expect, it } from 'vitest';

import { parseRulebookFile } from '../rulebook-schema.ts';

/** The rejection an unrecognized delivery mode must carry: naming the permitted set, not a bare "Invalid input". */
const DELIVERY_MESSAGE = "delivery must be 'ambient', 'hook', or 'skill', or a non-empty list of them";

/** The rejection a non-string version must carry: naming quoting as the fix, not a bare "Invalid input". */
const VERSION_TYPE_MESSAGE = "version must be quoted (e.g. version: '1.10'); unquoted, 1.10 is read as the number 1.1";

/** The rejection a version that cannot occupy its deployed line must carry, distinct from the quoting message. */
const VERSION_SHAPE_MESSAGE = "version must be a non-blank single line containing no '-->'";

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
    const { body } = parseRulebookFile(rulebookFile('slug: shell-conventions'));

    expect(body).toContain('# Shell conventions');
    expect(body).not.toContain('slug:');
  });

  it('when delivery is a list, normalizes it to an array', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, skill]'));

    expect(rulebook.delivery).toEqual(['ambient', 'skill']);
  });

  it('when delivery is omitted, defaults to ambient', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x'));

    expect(rulebook.delivery).toEqual(['ambient']);
  });

  it('accepts hook as the only delivery mode', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\ndelivery: hook'));

    expect(rulebook.delivery).toEqual(['hook']);
  });

  it('accepts hook alongside the modes the resolver acts on', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, hook, skill]'));

    expect(rulebook.delivery).toEqual(['ambient', 'hook', 'skill']);
  });

  it('throws when a delivery list is empty, which would name no route', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: []'))).toThrow(DELIVERY_MESSAGE);
  });

  it('throws when delivery names a mode the resolver does not act on', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: skil'))).toThrow(DELIVERY_MESSAGE);
  });

  it('throws when a delivery list carries a mode the resolver does not act on', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, skil]'))).toThrow(DELIVERY_MESSAGE);
  });

  it('reads a quoted version verbatim, keeping the digits an unquoted one would lose', () => {
    const { rulebook } = parseRulebookFile(rulebookFile("slug: x\nversion: '1.10'"));

    expect(rulebook.version).toBe('1.10');
  });

  it.each([
    ['a number', 'version: 3'],
    ['a decimal that loses a digit', 'version: 1.10'],
    ['an empty value, which YAML reads as null', 'version:'],
    ['a boolean', 'version: true'],
  ])('throws on %s version, naming quoting as the fix', (_label, declaration) => {
    expect(() => parseRulebookFile(rulebookFile(`slug: x\n${declaration}`))).toThrow(VERSION_TYPE_MESSAGE);
  });

  it.each([
    ['blank', "version: '   '"],
    ['multi-line', String.raw`version: "1\n2"`],
    ['closing the comment it is rendered into', "version: 'a --> b'"],
  ])('throws on a %s version, naming the shape the deployed line requires', (_label, declaration) => {
    expect(() => parseRulebookFile(rulebookFile(`slug: x\n${declaration}`))).toThrow(VERSION_SHAPE_MESSAGE);
  });

  it('tolerates unknown classification fields without throwing', () => {
    const { rulebook } = parseRulebookFile(
      rulebookFile('slug: shell-conventions\nlanguages: [bash]\ntags: [shell, style]'),
    );

    expect(rulebook.slug).toBe('shell-conventions');
  });

  it('parses a skill-name override', () => {
    const { rulebook } = parseRulebookFile(
      rulebookFile('slug: shell-conventions\nskill-name: shell-conventions-rulebook'),
    );

    expect(rulebook['skill-name']).toBe('shell-conventions-rulebook');
  });

  it('when skill-name is omitted, leaves it undefined', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: shell-conventions'));

    expect(rulebook['skill-name']).toBeUndefined();
  });

  it('throws when skill-name is not kebab-case', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\nskill-name: Not_Kebab'))).toThrow(/skill-name/);
  });

  it('throws when slug is missing', () => {
    expect(() => parseRulebookFile(rulebookFile('description: no slug here'))).toThrow(/slug/);
  });

  it('throws when slug is not kebab-case', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: Shell_Conventions'))).toThrow(/slug/);
  });

  it('names the source in the error when validation fails', () => {
    expect(() => parseRulebookFile(rulebookFile('description: no slug'), 'rulebooks/bad.md')).toThrow(
      /rulebooks\/bad\.md/,
    );
  });
});
