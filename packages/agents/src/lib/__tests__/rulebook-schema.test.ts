import { describe, expect, it } from 'vitest';

import { parseRulebookFile } from '../rulebook-schema.ts';

/** Wraps frontmatter and a body into a rulebook source file. */
function rulebookFile(frontmatter: string, body = '# Shell conventions\n\nUse strict mode.'): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

describe(parseRulebookFile, () => {
  it('parses the operational fields from valid frontmatter', () => {
    const { rulebook } = parseRulebookFile(
      rulebookFile('slug: shell-conventions\ndescription: Shell rules\ndelivery: ambient\nversion: 1'),
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

  it('throws when delivery names a mode the resolver does not act on', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: skil'))).toThrow(/delivery/);
  });

  it('throws when a delivery list carries a mode the resolver does not act on', () => {
    expect(() => parseRulebookFile(rulebookFile('slug: x\ndelivery: [ambient, skil]'))).toThrow(/delivery/);
  });

  it('coerces a numeric version to a string', () => {
    const { rulebook } = parseRulebookFile(rulebookFile('slug: x\nversion: 3'));

    expect(rulebook.version).toBe('3');
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
