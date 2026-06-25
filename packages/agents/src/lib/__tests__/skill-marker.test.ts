import { describe, expect, it } from 'vitest';

import { extractDeployedSkillSlug, injectSkillMarker } from '../skill-marker.ts';

const SKILL = '---\nname: people-report\nuser-invocable: true\n---\n\n# People report\n\nBody.\n';

describe(extractDeployedSkillSlug, () => {
  it('returns the slug stamped by injectSkillMarker', () => {
    expect(extractDeployedSkillSlug(injectSkillMarker(SKILL, 'people-report'))).toBe('people-report');
  });

  it('returns undefined when no marker is present', () => {
    expect(extractDeployedSkillSlug(SKILL)).toBeUndefined();
  });

  it('returns undefined for a rulebook-skill marker, keeping the namespaces disjoint', () => {
    expect(
      extractDeployedSkillSlug('---\nname: x\n---\n<!-- codeassembly-rulebook:shell-conventions -->\n'),
    ).toBeUndefined();
  });
});

describe(injectSkillMarker, () => {
  it('inserts the marker immediately after the frontmatter block', () => {
    const output = injectSkillMarker(SKILL, 'people-report');

    expect(output).toBe(
      '---\nname: people-report\nuser-invocable: true\n---\n<!-- codeassembly-skill:people-report -->\n\n# People report\n\nBody.\n',
    );
  });

  it('is idempotent: re-injecting the same slug leaves the content unchanged', () => {
    const once = injectSkillMarker(SKILL, 'people-report');

    expect(injectSkillMarker(once, 'people-report')).toBe(once);
  });

  it('throws a clear error when the content has no frontmatter block', () => {
    expect(() => injectSkillMarker('# No frontmatter\n', 'people-report')).toThrow(/frontmatter/i);
  });
});
