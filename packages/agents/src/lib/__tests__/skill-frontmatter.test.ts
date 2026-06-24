import { describe, expect, it } from 'vitest';

import { readSkillDeploy } from '../skill-frontmatter.ts';

describe(readSkillDeploy, () => {
  it('returns declared for an explicit deploy: declared', () => {
    expect(readSkillDeploy('---\nname: x\ndeploy: declared\n---\n\n# Body\n')).toBe('declared');
  });

  it('returns install for an explicit deploy: install', () => {
    expect(readSkillDeploy('---\nname: x\ndeploy: install\n---\n\n# Body\n')).toBe('install');
  });

  it('defaults to install when the deploy field is absent', () => {
    expect(readSkillDeploy('---\nname: x\ndescription: y\n---\n\n# Body\n')).toBe('install');
  });

  it('defaults to install when the file has no frontmatter', () => {
    expect(readSkillDeploy('# Body without frontmatter\n')).toBe('install');
  });

  it('throws a clear error for an unrecognized deploy value, naming the source', () => {
    expect(() => readSkillDeploy('---\nname: x\ndeploy: published\n---\n', 'people-report/SKILL.md')).toThrow(
      /people-report\/SKILL\.md.*deploy.*published/i,
    );
  });

  it('throws for a non-string deploy value', () => {
    expect(() => readSkillDeploy('---\nname: x\ndeploy: true\n---\n')).toThrow(/deploy/i);
  });
});
