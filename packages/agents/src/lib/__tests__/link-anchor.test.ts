import { describe, expect, it } from 'vitest';

import { createContentRootLinkAnchor, createSkillLinkAnchor, type LinkAnchorContext } from '../link-anchor.ts';

const PROJECT_BASE = '/repo/project';

function buildContext(overrides: Partial<LinkAnchorContext> = {}): LinkAnchorContext {
  return {
    deployedSkillDirs: new Set(['commit', 'orchestrate']),
    domainBase: '~',
    homeDir: '.claude',
    skillsDirName: 'skills',
    ...overrides,
  };
}

describe(createSkillLinkAnchor, () => {
  describe('project domain', () => {
    it('anchors a deployed skill under the project, where the same sync run writes it', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('orchestrate/modules/review-cycle.md')).toBe(
        '/repo/project/.claude/skills/orchestrate/modules/review-cycle.md',
      );
    });

    it('keeps a support entry in the harness home, which install populates in either domain', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('_data/concision.md')).toBe('~/.claude/skills/_data/concision.md');
    });

    it('keeps a skill the run does not deploy in the harness home, its only addressable location', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('wrap-up/SKILL.md')).toBe('~/.claude/skills/wrap-up/SKILL.md');
    });

    it('leaves a target escaping the skills dir anchored at the harness home', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('../scripts/run.sh')).toBe('~/.claude/skills/../scripts/run.sh');
    });
  });

  describe('home domain', () => {
    // The invariant the whole change rests on: with the domain base at `~`, both destinations render the same string,
    // so no home-domain output can shift however the deployed set is populated.
    it.each([
      ['a deployed skill', 'commit/SKILL.md', '~/.claude/skills/commit/SKILL.md'],
      ['a support entry', '_data/concision.md', '~/.claude/skills/_data/concision.md'],
      ['an undeployed skill', 'wrap-up/SKILL.md', '~/.claude/skills/wrap-up/SKILL.md'],
      ['an escaping target', '../scripts/run.sh', '~/.claude/skills/../scripts/run.sh'],
    ])('anchors %s under the harness skills dir', (_label, target, expected) => {
      expect(createSkillLinkAnchor(buildContext())(target)).toBe(expected);
    });
  });

  it('renders the harness its context names', () => {
    const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE, homeDir: '.rovodev' }));
    expect(anchor('commit/SKILL.md')).toBe('/repo/project/.rovodev/skills/commit/SKILL.md');
  });
});

describe(createContentRootLinkAnchor, () => {
  it('anchors a scripts target at the harness home, the only tree that deploys it', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('scripts/describe-change.sh')).toBe('~/.claude/scripts/describe-change.sh');
  });

  it('hands a deployed skill target to the skills anchor', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('skills/commit/SKILL.md')).toBe('/repo/project/.claude/skills/commit/SKILL.md');
  });

  it('hands a support entry target to the skills anchor', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('skills/_data/concision.md')).toBe('~/.claude/skills/_data/concision.md');
  });
});
