import { describe, expect, it } from 'vitest';

import { readDependencies } from '../dependency-frontmatter.ts';

/** Wraps a frontmatter body in `---` delimiters with a throwaway markdown body. */
function withFrontmatter(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# Body\n`;
}

describe(readDependencies, () => {
  it('reads slugs grouped by type, keyed by the singular artifact type', () => {
    const content = withFrontmatter(
      'name: recommended\ndependencies:\n  rulebooks:\n    - typescript-conventions\n  skills:\n    - people-report\n  subagents:\n    - canary\n  collections:\n    - other',
    );

    expect(readDependencies(content)).toEqual({
      rulebook: ['typescript-conventions'],
      skill: ['people-report'],
      subagent: ['canary'],
      collection: ['other'],
    });
  });

  it('normalizes a bare slug and a structured entry alike, tolerating unknown entry keys', () => {
    const content = withFrontmatter(
      'dependencies:\n  skills:\n    - people-report\n    - name: classify-complexity\n      source: npm',
    );

    expect(readDependencies(content)).toEqual({ skill: ['people-report', 'classify-complexity'] });
  });

  it('returns no dependencies for an absent block, absent frontmatter, or a null value', () => {
    expect(readDependencies(withFrontmatter('name: recommended'))).toEqual({});
    expect(readDependencies('# No frontmatter\n')).toEqual({});
    expect(readDependencies(withFrontmatter('dependencies:'))).toEqual({});
  });

  it('tolerates a null sub-key, reading it as no edges of that type', () => {
    const content = withFrontmatter('dependencies:\n  skills:\n  subagents:\n    - canary');

    expect(readDependencies(content)).toEqual({ subagent: ['canary'] });
  });

  it('throws on an unknown type key, naming the source label', () => {
    const content = withFrontmatter('dependencies:\n  widgets:\n    - gadget');

    expect(() => readDependencies(content, 'collections/recommended.md')).toThrow(/recommended\.md.*widgets/s);
  });

  it('throws when a type value is not a list of slugs', () => {
    const content = withFrontmatter('dependencies:\n  skills: people-report');

    expect(() => readDependencies(content)).toThrow(/skills.*list/s);
  });

  it('throws when the block itself is not a mapping', () => {
    const content = withFrontmatter('dependencies:\n  - people-report');

    expect(() => readDependencies(content)).toThrow(/mapping/);
  });
});
