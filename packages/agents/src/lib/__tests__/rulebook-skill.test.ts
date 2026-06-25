import { unindent } from '@williamthorsen/toolbelt.strings/candidate';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { extractRulebookSkillSlug, renderSkillFile, resolveSkillName } from '../rulebook-skill.ts';
import { isRecord } from '../type-guards.ts';

describe(extractRulebookSkillSlug, () => {
  it('returns the slug from a rendered skill file', () => {
    const output = renderSkillFile('consult-shell-conventions', 'shell-conventions', 'Shell rules.', 'Body.');

    expect(extractRulebookSkillSlug(output)).toBe('shell-conventions');
  });

  it('returns undefined when the ownership marker is absent', () => {
    expect(extractRulebookSkillSlug('---\nname: x\n---\n\n# Hand-authored skill\n')).toBeUndefined();
  });
});

describe(renderSkillFile, () => {
  it('renders frontmatter, the ownership marker, and the body for a described rulebook', () => {
    const output = renderSkillFile(
      'consult-shell-conventions',
      'shell-conventions',
      'Shell rules.',
      '# Shell\n\nBody.',
    );

    expect(output).toBe(unindent`
      ---
      name: consult-shell-conventions
      description: Shell rules.
      user-invocable: true
      ---
      <!-- codeassembly-rulebook:shell-conventions -->

      # Shell

      Body.

    `);
  });

  it('uses the skill name for the frontmatter name and the slug for the ownership marker', () => {
    const output = renderSkillFile('shell-conventions-rulebook', 'shell-conventions', 'D.', 'Body.');

    expect(output).toContain('name: shell-conventions-rulebook');
    expect(output).toContain('<!-- codeassembly-rulebook:shell-conventions -->');
  });

  it('omits the description line when no description is provided', () => {
    const output = renderSkillFile('consult-alpha', 'alpha', undefined, 'Body.');

    expect(output).not.toContain('description:');
    expect(output).toContain('name: consult-alpha');
    expect(output).toContain('user-invocable: true');
  });

  it('escapes a description containing YAML-special characters so it round-trips', () => {
    const description = 'Has: a colon and "quotes"';

    const output = renderSkillFile('consult-alpha', 'alpha', description, 'Body.');

    expect(frontmatterDescription(output)).toBe(description);
  });

  it('trims surrounding whitespace from the body', () => {
    const output = renderSkillFile('consult-alpha', 'alpha', 'D.', '\n\n  # Title\n\nBody.\n\n');

    expect(output.endsWith('<!-- codeassembly-rulebook:alpha -->\n\n# Title\n\nBody.\n')).toBe(true);
  });

  it('produces byte-identical output for identical inputs', () => {
    expect(renderSkillFile('consult-alpha', 'alpha', 'D.', 'Body.')).toBe(
      renderSkillFile('consult-alpha', 'alpha', 'D.', 'Body.'),
    );
  });
});

describe(resolveSkillName, () => {
  it('derives consult-<slug> when no override is given', () => {
    expect(resolveSkillName('shell-conventions')).toBe('consult-shell-conventions');
  });

  it('uses the override verbatim when given', () => {
    expect(resolveSkillName('shell-conventions', 'shell-conventions-rulebook')).toBe('shell-conventions-rulebook');
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
