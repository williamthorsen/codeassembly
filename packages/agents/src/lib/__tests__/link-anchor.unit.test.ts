import { describe, expect, it } from 'vitest';

import { HARNESSES } from '../harness.ts';
import { createContentRootLinkAnchor, createSkillLinkAnchor, type LinkAnchorContext } from '../link-anchor.ts';

const PROJECT_BASE = '/repo/project';
const ROVO_HOME = HARNESSES.rovo.homeDir;

function buildContext(overrides: Partial<LinkAnchorContext> = {}): LinkAnchorContext {
  return {
    deployedSkillDirs: new Set(['commit', 'orchestrate']),
    domainBase: '~',
    homeDir: '.claude',
    skillsDirName: 'skills',
    supportNamespace: undefined,
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

  describe('source-owned body', () => {
    it('anchors a support entry in the owning source namespace under the project', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE, supportNamespace: 'org' }));
      expect(anchor('_data/house-style.md')).toBe('/repo/project/.claude/skills/_sources/org/_data/house-style.md');
    });

    // Unlike the library case, this destination applies in the home domain too: the source's support entries deploy
    // into the namespace there as well, which is the address they had nowhere else.
    it('anchors a support entry in the namespace in the home domain', () => {
      const anchor = createSkillLinkAnchor(buildContext({ supportNamespace: 'org' }));
      expect(anchor('_data/house-style.md')).toBe('~/.claude/skills/_sources/org/_data/house-style.md');
    });

    it('anchors a deployed sibling skill in the flat skills dir rather than the namespace', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE, supportNamespace: 'org' }));
      expect(anchor('commit/SKILL.md')).toBe('/repo/project/.claude/skills/commit/SKILL.md');
    });

    it('nests a scoped package name as its own segments', () => {
      const anchor = createSkillLinkAnchor(
        buildContext({ domainBase: PROJECT_BASE, supportNamespace: '@williamthorsen/nmr' }),
      );
      expect(anchor('_data/commands.md')).toBe(
        '/repo/project/.claude/skills/_sources/@williamthorsen/nmr/_data/commands.md',
      );
    });
  });

  it('renders the harness its context names', () => {
    const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE, homeDir: ROVO_HOME }));
    expect(anchor('commit/SKILL.md')).toBe(`${PROJECT_BASE}/${ROVO_HOME}/skills/commit/SKILL.md`);
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

  it("hands a source-owned support entry to the skills anchor, reaching that source's namespace", () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE, supportNamespace: 'org' }));
    expect(anchor('skills/_data/house-style.md')).toBe(
      '/repo/project/.claude/skills/_sources/org/_data/house-style.md',
    );
  });

  // The namespace addresses support content under `skills/`, so a sibling tree keeps the harness home even when the
  // body carrying the link belongs to a source.
  it('keeps a scripts target at the harness home for a source-owned body', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE, supportNamespace: 'org' }));
    expect(anchor('scripts/describe-change.sh')).toBe('~/.claude/scripts/describe-change.sh');
  });
});
