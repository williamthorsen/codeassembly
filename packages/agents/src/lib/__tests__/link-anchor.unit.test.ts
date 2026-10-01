import { describe, expect, it } from 'vitest';

import { HARNESSES } from '../harness.ts';
import { createContentRootLinkAnchor, createSkillLinkAnchor, type LinkAnchorContext } from '../link-anchor.ts';

const PROJECT_BASE = '/repo/project';
const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(createSkillLinkAnchor, () => {
  describe('project domain', () => {
    it('anchors a deployed skill under the project, where the same sync run writes it', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('orchestrate/modules/review-cycle.md')).toBe(
        '/repo/project/.claude/skills/orchestrate/modules/review-cycle.md',
      );
    });

    it('anchors a support entry in the owning source namespace under the project', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('_data/concision.md')).toBe('/repo/project/.claude/skills/_sources/org/_data/concision.md');
    });

    it('anchors a file support entry in the owning source namespace by its full name', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('glossary.md')).toBe('/repo/project/.claude/skills/_sources/org/glossary.md');
    });

    it('keeps a skill that the run does not deploy in the harness home, its only addressable location', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('wrap-up/SKILL.md')).toBe('~/.claude/skills/wrap-up/SKILL.md');
    });

    it('leaves a target escaping the skills dir anchored at the harness home', () => {
      const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
      expect(anchor('../scripts/run.sh')).toBe('~/.claude/skills/../scripts/run.sh');
    });

    it('nests a scoped package name as its own segments', () => {
      const anchor = createSkillLinkAnchor(
        buildContext({ domainBase: PROJECT_BASE, supportNamespace: '@williamthorsen/nmr' }),
      );
      expect(anchor('_data/commands.md')).toBe(
        '/repo/project/.claude/skills/_sources/@williamthorsen/nmr/_data/commands.md',
      );
    });

    it('prefers a deployed skill over a support entry of the same name', () => {
      const anchor = createSkillLinkAnchor(
        buildContext({ domainBase: PROJECT_BASE, supportEntries: new Set(['commit']) }),
      );
      expect(anchor('commit/SKILL.md')).toBe('/repo/project/.claude/skills/commit/SKILL.md');
    });
  });

  describe('home domain', () => {
    it.each([
      ['a deployed skill', 'commit/SKILL.md', '~/.claude/skills/commit/SKILL.md'],
      ['a support entry', '_data/concision.md', '~/.claude/skills/_sources/org/_data/concision.md'],
      ['an undeployed skill', 'wrap-up/SKILL.md', '~/.claude/skills/wrap-up/SKILL.md'],
      ['an escaping target', '../scripts/run.sh', '~/.claude/skills/../scripts/run.sh'],
    ])('anchors %s under the harness skills dir', (_label, target, expected) => {
      expect(createSkillLinkAnchor(buildContext())(target)).toBe(expected);
    });
  });

  it('renders the harness named by its context', () => {
    const anchor = createSkillLinkAnchor(buildContext({ domainBase: PROJECT_BASE, homeDir: ROVO_HOME }));
    expect(anchor('commit/SKILL.md')).toBe(`${PROJECT_BASE}/${ROVO_HOME}/skills/commit/SKILL.md`);
    expect(anchor('_data/concision.md')).toBe(`${PROJECT_BASE}/${ROVO_HOME}/skills/_sources/org/_data/concision.md`);
    expect(anchor('wrap-up/SKILL.md')).toBe(`~/${ROVO_HOME}/skills/wrap-up/SKILL.md`);
  });
});

describe(createContentRootLinkAnchor, () => {
  it('anchors a scripts target at the harness home, the only tree that deploys it', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('scripts/describe-change.mjs')).toBe('~/.claude/scripts/describe-change.mjs');
  });

  it('hands a deployed skill target to the skills anchor', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('skills/commit/SKILL.md')).toBe('/repo/project/.claude/skills/commit/SKILL.md');
  });

  it("hands a support entry target to the skills anchor, reaching the owning source's namespace", () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('skills/_data/house-style.md')).toBe(
      '/repo/project/.claude/skills/_sources/org/_data/house-style.md',
    );
  });

  it('hands an undeployed skill target to the skills anchor, which keeps it at the harness home', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE }));
    expect(anchor('skills/wrap-up/SKILL.md')).toBe('~/.claude/skills/wrap-up/SKILL.md');
  });

  // The namespace addresses support content under `skills/`, so a sibling tree keeps the harness home.
  it('keeps a scripts target at the harness home whatever the owning source', () => {
    const anchor = createContentRootLinkAnchor(buildContext({ domainBase: PROJECT_BASE, supportNamespace: 'other' }));
    expect(anchor('scripts/describe-change.mjs')).toBe('~/.claude/scripts/describe-change.mjs');
  });
});

// region | Helpers

/** Builds a link-anchor context, with `overrides` applied over its defaults. */
function buildContext(overrides: Partial<LinkAnchorContext> = {}): LinkAnchorContext {
  return {
    deployedSkillDirs: new Set(['commit', 'orchestrate']),
    domainBase: '~',
    homeDir: '.claude',
    skillsDirName: 'skills',
    supportEntries: new Set(['_data', 'glossary.md']),
    supportNamespace: 'org',
    ...overrides,
  };
}

// endregion | Helpers
