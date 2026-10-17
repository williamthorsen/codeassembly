import { describe, expect, it } from 'vitest';

import {
  readCollectionDisposition,
  readDependencies,
  readInjectedRulebooks,
  readInjectedSkills,
  readMembers,
  readStandaloneReason,
} from '../dependency-frontmatter.ts';

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

  it('does not return any dependencies for an absent block, absent frontmatter, or a null value', () => {
    expect(readDependencies(withFrontmatter('name: recommended'))).toEqual({});
    expect(readDependencies('# No frontmatter\n')).toEqual({});
    expect(readDependencies(withFrontmatter('dependencies:'))).toEqual({});
  });

  it('tolerates a null sub-key, reading it as an empty list of edges of that type', () => {
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

  it('throws when a non-collection declares members, naming the source', () => {
    const content = withFrontmatter("members: '@library'");

    expect(() => readDependencies(content, 'skills/people-report/SKILL.md')).toThrow(/people-report.*members/s);
  });

  it('throws when a non-collection declares a disposition, naming the source', () => {
    const content = withFrontmatter('disposition: public');

    expect(() => readDependencies(content, 'skills/people-report/SKILL.md')).toThrow(/people-report.*disposition/s);
  });
});

describe(readMembers, () => {
  it('reads the @library token as a library directive', () => {
    expect(readMembers(withFrontmatter("name: all\nmembers: '@library'"))).toEqual({ kind: 'library' });
  });

  it('reads the @unclaimed token as an unclaimed directive', () => {
    expect(readMembers(withFrontmatter("name: triage\nmembers: '@unclaimed'"))).toEqual({ kind: 'unclaimed' });
  });

  it('reads an explicit per-type members block as edges', () => {
    const content = withFrontmatter('members:\n  skills:\n    - people-report\n  subagents:\n    - canary');

    expect(readMembers(content)).toEqual({
      kind: 'explicit',
      edges: { skill: ['people-report'], subagent: ['canary'] },
    });
  });

  it('treats absent or null members as an empty collection', () => {
    expect(readMembers(withFrontmatter('name: empty'))).toEqual({ kind: 'explicit', edges: {} });
    expect(readMembers(withFrontmatter('members:'))).toEqual({ kind: 'explicit', edges: {} });
  });

  it('throws naming the token and source on an unrecognized members token', () => {
    expect(() => readMembers(withFrontmatter("members: '@everything'"), 'collections/all.md')).toThrow(
      /all\.md.*@everything/s,
    );
  });

  it('throws when members is neither a token nor a mapping', () => {
    expect(() => readMembers(withFrontmatter('members:\n  - people-report'), 'collections/all.md')).toThrow(/all\.md/);
  });

  it('throws when a collection also declares dependencies, naming the source', () => {
    const content = withFrontmatter("members: '@library'\ndependencies:\n  skills:\n    - people-report");

    expect(() => readMembers(content, 'collections/all.md')).toThrow(/all\.md.*dependencies/s);
  });

  it('throws when a collection declares standalone, naming the source', () => {
    const content = withFrontmatter('standalone: rarely wanted\nmembers:\n  skills:\n    - people-report');

    expect(() => readMembers(content, 'collections/personal.md')).toThrow(/personal\.md.*standalone/s);
  });
});

describe(readInjectedRulebooks, () => {
  it('reads the top-level rulebooks list, normalizing bare and structured entries alike', () => {
    const content = withFrontmatter(
      'name: orchestrated-coder\nrulebooks:\n  - review-criteria\n  - name: shell-conventions\n    source: npm',
    );

    expect(readInjectedRulebooks(content)).toEqual(['review-criteria', 'shell-conventions']);
  });

  it('does not return any rulebooks for an absent key, absent frontmatter, or a null value', () => {
    expect(readInjectedRulebooks(withFrontmatter('name: canary'))).toEqual([]);
    expect(readInjectedRulebooks('# No frontmatter\n')).toEqual([]);
    expect(readInjectedRulebooks(withFrontmatter('rulebooks:'))).toEqual([]);
  });

  it('reads the rulebooks list independently of the skills list', () => {
    const content = withFrontmatter('skills:\n  - commit\nrulebooks:\n  - review-criteria');

    expect(readInjectedRulebooks(content)).toEqual(['review-criteria']);
    expect(readInjectedSkills(content)).toEqual(['commit']);
  });

  it('throws when rulebooks is not a list, naming the source label', () => {
    const content = withFrontmatter('rulebooks: review-criteria');

    expect(() => readInjectedRulebooks(content, 'subagents/orchestrated-coder.md')).toThrow(
      /orchestrated-coder\.md.*list/s,
    );
  });
});

describe(readInjectedSkills, () => {
  it('reads the top-level skills list, normalizing bare and structured entries alike', () => {
    const content = withFrontmatter(
      'name: orchestrated-coder\nskills:\n  - anti-patterns\n  - name: commit\n    source: npm',
    );

    expect(readInjectedSkills(content)).toEqual(['anti-patterns', 'commit']);
  });

  it('does not return any skills for an absent key, absent frontmatter, or a null value', () => {
    expect(readInjectedSkills(withFrontmatter('name: canary'))).toEqual([]);
    expect(readInjectedSkills('# No frontmatter\n')).toEqual([]);
    expect(readInjectedSkills(withFrontmatter('skills:'))).toEqual([]);
  });

  it('throws when skills is not a list, naming the source label', () => {
    const content = withFrontmatter('skills: anti-patterns');

    expect(() => readInjectedSkills(content, 'subagents/orchestrated-coder.md')).toThrow(
      /orchestrated-coder\.md.*list/s,
    );
  });
});

describe(readCollectionDisposition, () => {
  it('reads each supported disposition of an enumerated collection', () => {
    for (const disposition of ['opt-in', 'personal', 'public']) {
      const content = withFrontmatter(`disposition: ${disposition}\nmembers:\n  skills:\n    - people-report`);

      expect(readCollectionDisposition(content)).toBe(disposition);
    }
  });

  it('returns undefined for a plain bundle', () => {
    expect(readCollectionDisposition(withFrontmatter('members:\n  skills:\n    - people-report'))).toBeUndefined();
  });

  it('throws naming the value and source on an unknown disposition', () => {
    const content = withFrontmatter('disposition: vetted\nmembers:\n  skills:\n    - people-report');

    expect(() => readCollectionDisposition(content, 'collections/team.md')).toThrow(/team\.md.*vetted/s);
  });

  it.each(['@library', '@unclaimed'])('throws on a disposition declared by a %s collection', (token) => {
    const content = withFrontmatter(`disposition: public\nmembers: '${token}'`);

    expect(() => readCollectionDisposition(content, 'collections/computed.md')).toThrow(/computed\.md.*computed/s);
  });
});

describe(readStandaloneReason, () => {
  it('reads the reason', () => {
    expect(readStandaloneReason(withFrontmatter('standalone: wanted once per machine'))).toBe(
      'wanted once per machine',
    );
  });

  it('returns undefined when the artifact does not declare one', () => {
    expect(readStandaloneReason(withFrontmatter('name: canary'))).toBeUndefined();
    expect(readStandaloneReason('# No frontmatter\n')).toBeUndefined();
  });

  it.each(["''", 'true', '\n  - a list'])('throws naming the source on the value %s', (value) => {
    const content = withFrontmatter(`standalone: ${value}`);

    expect(() => readStandaloneReason(content, 'subagents/canary.md')).toThrow(/canary\.md.*non-empty string/s);
  });
});
