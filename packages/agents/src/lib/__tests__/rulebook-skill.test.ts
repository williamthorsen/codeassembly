import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { extractRulebookSkillSlug, renderSkillFile } from '../rulebook-skill.ts';
import { isRecord } from '../type-guards.ts';

describe(extractRulebookSkillSlug, () => {
  it('returns the slug from a rendered skill file', () => {
    const output = renderSkillFile('shell-conventions', 'Shell rules.', 'Body.');

    expect(extractRulebookSkillSlug(output)).toBe('shell-conventions');
  });

  it('returns undefined when the ownership marker is absent', () => {
    expect(extractRulebookSkillSlug('---\nname: x\n---\n\n# Hand-authored skill\n')).toBeUndefined();
  });
});

describe(renderSkillFile, () => {
  it('renders frontmatter, the ownership marker, and the body for a described rulebook', () => {
    const output = renderSkillFile('shell-conventions', 'Shell rules.', '# Shell\n\nBody.');

    expect(output).toBe(
      [
        '---',
        'name: shell-conventions',
        'description: Shell rules.',
        'user-invocable: true',
        '---',
        '<!-- codeassembly-rulebook:shell-conventions -->',
        '',
        '# Shell',
        '',
        'Body.',
        '',
      ].join('\n'),
    );
  });

  it('omits the description line when no description is provided', () => {
    const output = renderSkillFile('alpha', undefined, 'Body.');

    expect(output).not.toContain('description:');
    expect(output).toContain('name: alpha');
    expect(output).toContain('user-invocable: true');
  });

  it('escapes a description containing YAML-special characters so it round-trips', () => {
    const description = 'Has: a colon and "quotes"';

    const output = renderSkillFile('alpha', description, 'Body.');

    expect(frontmatterDescription(output)).toBe(description);
  });

  it('trims surrounding whitespace from the body', () => {
    const output = renderSkillFile('alpha', 'D.', '\n\n  # Title\n\nBody.\n\n');

    expect(output.endsWith('<!-- codeassembly-rulebook:alpha -->\n\n# Title\n\nBody.\n')).toBe(true);
  });

  it('produces byte-identical output for identical inputs', () => {
    expect(renderSkillFile('alpha', 'D.', 'Body.')).toBe(renderSkillFile('alpha', 'D.', 'Body.'));
  });
});

/** Returns the `description` field parsed from a rendered skill file's YAML frontmatter. */
function frontmatterDescription(skill: string): unknown {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
  if (block === undefined) {
    throw new Error('rendered skill has no frontmatter block');
  }
  const parsed: unknown = parseYaml(block);
  if (!isRecord(parsed)) {
    throw new Error('rendered skill frontmatter is not a mapping');
  }
  return parsed.description;
}
