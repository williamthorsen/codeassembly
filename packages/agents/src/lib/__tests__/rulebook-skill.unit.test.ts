import { dedent } from '@williamthorsen/toolbelt.strings/candidate';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  extractRulebookSkillSlug,
  renderSkillFile,
  resolveSkillName,
  type RulebookSkillFile,
} from '../rulebook-skill.ts';
import { isRecord } from '../type-guards.ts';

describe(extractRulebookSkillSlug, () => {
  it('returns the slug from a rendered skill file', () => {
    const output = renderSkillFile(buildSkillFile({ description: 'Shell rules.', slug: 'shell-conventions' }));

    expect(extractRulebookSkillSlug(output)).toBe('shell-conventions');
  });

  it('returns undefined when the ownership marker is absent', () => {
    expect(extractRulebookSkillSlug('---\nname: x\n---\n\n# Hand-authored skill\n')).toBeUndefined();
  });
});

describe(renderSkillFile, () => {
  it('renders frontmatter, the ownership marker, and the body for a described rulebook', () => {
    const output = renderSkillFile(
      buildSkillFile({
        body: '# Shell\n\nBody.',
        description: 'Shell rules.',
        skillName: 'consult-shell-conventions',
        slug: 'shell-conventions',
      }),
    );

    expect(output).toBe(dedent`
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
    const output = renderSkillFile(
      buildSkillFile({ skillName: 'shell-conventions-rulebook', slug: 'shell-conventions' }),
    );

    expect(output).toContain('name: shell-conventions-rulebook');
    expect(output).toContain('<!-- codeassembly-rulebook:shell-conventions -->');
  });

  it('omits the description line when no description is provided', () => {
    const output = renderSkillFile(buildSkillFile({ description: undefined }));

    expect(output).not.toContain('description:');
    expect(output).toContain('name: consult-alpha');
    expect(output).toContain('user-invocable: true');
  });

  it('escapes a description containing YAML-special characters so it round-trips', () => {
    const description = 'Has: a colon and "quotes"';

    const output = renderSkillFile(buildSkillFile({ description }));

    expect(frontmatterDescription(output)).toBe(description);
  });

  it('trims surrounding whitespace from the body', () => {
    const output = renderSkillFile(buildSkillFile({ body: '\n\n  # Title\n\nBody.\n\n' }));

    expect(output.endsWith('<!-- codeassembly-rulebook:alpha -->\n\n# Title\n\nBody.\n')).toBe(true);
  });

  it('writes the version line directly below the ownership marker', () => {
    const output = renderSkillFile(buildSkillFile({ slug: 'shell-conventions', version: '3' }));

    expect(output).toContain('<!-- codeassembly-rulebook:shell-conventions -->\n<!-- rulebook-version: 3 -->\n\nBody.');
  });

  it('writes no version line for a rulebook declaring no version', () => {
    expect(renderSkillFile(buildSkillFile({}))).not.toContain('rulebook-version');
  });

  it('returns the slug from a file carrying a version line', () => {
    const output = renderSkillFile(buildSkillFile({ slug: 'shell-conventions', version: '3' }));

    expect(extractRulebookSkillSlug(output)).toBe('shell-conventions');
  });

  it('produces byte-identical output for identical inputs', () => {
    expect(renderSkillFile(buildSkillFile({ version: '3' }))).toBe(renderSkillFile(buildSkillFile({ version: '3' })));
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

/** Builds a rulebook skill file's inputs, so a case names only the field it exercises. */
function buildSkillFile(overrides: Partial<RulebookSkillFile>): RulebookSkillFile {
  return {
    body: 'Body.',
    description: 'D.',
    skillName: 'consult-alpha',
    slug: 'alpha',
    version: undefined,
    ...overrides,
  };
}

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
