import { describe, expect, it } from 'vitest';

import { renderDryRunReport, renderSyncReport } from '../report.ts';
import type { SyncOutcome, SyncPlan } from '../sync.ts';
import { buildSyncPlan } from '../test-utils/build-sync-plan.ts';

const HOME_HOST = '/home/.claude/CLAUDE.md';
const LOCAL_HOST = '/project/CLAUDE.local.md';

/**
 * A phrase unique to each guidance-hook advisory's rendered line. Shared so the per-kind tests and the
 * nothing-rendered test anchor on one set: a phrase only some kinds carry would let the latter pass while a
 * regression emits one of the others.
 */
const ADVISORY_ANCHORS = {
  'bound-ambient': 'receives its text twice',
  'bound-undeclared': 'whose delivery does not name',
  'bound-unreached': 'the binding delivers nothing',
  'declared-unbound': 'guidance-hook delivery that nothing binds',
} as const;

/** Wraps a plan as the outcome a completed reconciliation returns. */
function reconciled(overrides: Partial<SyncPlan> = {}): SyncOutcome {
  return { kind: 'reconciled', plan: buildSyncPlan(overrides) };
}

/** The text of every line one renderer produces, joined as the terminal would show it. */
function textOf(lines: ReadonlyArray<{ text: string }>): string {
  return lines.map((line) => line.text).join('\n');
}

describe('dropped-harness retraction', () => {
  const DROPPED = {
    harnessId: 'rovo',
    skillDirs: ['/project/.rovo/skills/consult-alpha'],
    subagentFiles: ['/project/.rovo/agents/lede-drafter.md'],
    supportPaths: ['/project/.rovo/skills/_sources'],
    ambientHost: { kind: 'delete', path: '/project/AGENTS.local.md' },
    promptsYml: { kind: 'rewrite', path: '/project/.rovo/prompts.yml', content: 'prompts:\n' },
  } as const;

  it('names every surface on the live path, under a header naming the harness', () => {
    const output = textOf(renderSyncReport(reconciled({ droppedHarnesses: [DROPPED] })));

    expect(output).toContain('Retracted harness dropped from the declaration: rovo');
    expect(output).toContain('  removed skill /project/.rovo/skills/consult-alpha');
    expect(output).toContain('  removed subagent /project/.rovo/agents/lede-drafter.md');
    expect(output).toContain('  removed source support /project/.rovo/skills/_sources');
    expect(output).toContain('  removed /project/AGENTS.local.md');
    expect(output).toContain('  stripped the codeassembly region from /project/.rovo/prompts.yml');
  });

  it('names every surface on the dry-run path', () => {
    const output = textOf(renderDryRunReport(reconciled({ droppedHarnesses: [DROPPED] })));

    expect(output).toContain('  retract harness dropped from the declaration: rovo');
    expect(output).toContain('    remove skill /project/.rovo/skills/consult-alpha');
    expect(output).toContain('    remove /project/AGENTS.local.md');
    expect(output).toContain('    strip the codeassembly region from /project/.rovo/prompts.yml');
  });

  it('says the ambient region is stripped where the host survives it', () => {
    const output = textOf(
      renderSyncReport(
        reconciled({
          droppedHarnesses: [
            {
              ...DROPPED,
              ambientHost: { kind: 'rewrite', path: HOME_HOST, content: '# Guidance\n' },
            },
          ],
        }),
      ),
    );

    expect(output).toContain(`  stripped the ambient region from ${HOME_HOST}`);
  });

  it('warns about a damaged ambient host on both paths, outside the harness block', () => {
    const damaged = {
      ...DROPPED,
      ambientHost: { kind: 'damaged', path: '/project/AGENTS.local.md' },
    } as const;
    const warning =
      '⚠️ Skipping ambient retraction: /project/AGENTS.local.md carries a damaged ambient region. ' +
      'Repair the codeassembly-ambient markers and re-run, or the withdrawn guidance keeps loading.';

    expect(textOf(renderSyncReport(reconciled({ droppedHarnesses: [damaged] })))).toContain(warning);
    expect(textOf(renderDryRunReport(reconciled({ droppedHarnesses: [damaged] })))).toContain(warning);
  });

  it('names no ambient action for a damaged host, whose block carries only the other removals', () => {
    const output = textOf(
      renderSyncReport(
        reconciled({
          droppedHarnesses: [{ ...DROPPED, ambientHost: { kind: 'damaged', path: '/project/AGENTS.local.md' } }],
        }),
      ),
    );

    expect(output).toContain('  removed skill /project/.rovo/skills/consult-alpha');
    expect(output).not.toContain('removed /project/AGENTS.local.md');
    expect(output).not.toContain('stripped the ambient region');
  });

  it('renders no block header for a harness whose only residue is a damaged host', () => {
    const damagedOnly = {
      harnessId: 'rovo',
      skillDirs: [],
      subagentFiles: [],
      supportPaths: [],
      ambientHost: { kind: 'damaged', path: '/project/AGENTS.local.md' },
      promptsYml: undefined,
    } as const;

    expect(textOf(renderSyncReport(reconciled({ droppedHarnesses: [damagedOnly] })))).not.toContain(
      'Retracted harness dropped from the declaration',
    );
    expect(textOf(renderDryRunReport(reconciled({ droppedHarnesses: [damagedOnly] })))).not.toContain(
      'retract harness dropped from the declaration',
    );
  });

  it('adds no line when the run dropped no harness', () => {
    expect(textOf(renderSyncReport(reconciled()))).not.toContain('dropped from the declaration');
    expect(textOf(renderDryRunReport(reconciled()))).not.toContain('dropped from the declaration');
  });
});

describe('ambient-host skips', () => {
  it('reports a skip that names a problem on both paths, in the same words', () => {
    const outcome = reconciled({
      ambientHosts: [
        { hostPath: HOME_HOST, plan: { kind: 'skip', reason: { cause: 'stale-install', status: 'missing' } } },
      ],
    });
    const sentence = `${HOME_HOST} does not exist. Run \`codeassembly install\`, then re-run \`sync --global\`.`;

    expect(textOf(renderDryRunReport(outcome))).toContain(sentence);
    expect(textOf(renderSyncReport(outcome))).toContain(sentence);
  });

  it('reports a skip that names an ordinary outcome on neither path', () => {
    const outcome = reconciled({
      ambientHosts: [{ hostPath: LOCAL_HOST, plan: { kind: 'skip', reason: { cause: 'not-needed' } } }],
    });

    expect(textOf(renderDryRunReport(outcome))).not.toContain(LOCAL_HOST);
    expect(textOf(renderSyncReport(outcome))).not.toContain(LOCAL_HOST);
  });

  it('raises a reported skip on the warning stream of a live run', () => {
    const outcome = reconciled({
      ambientHosts: [{ hostPath: HOME_HOST, plan: { kind: 'skip', reason: { cause: 'damaged-region' } } }],
    });

    expect(renderSyncReport(outcome).filter((line) => line.level === 'warn')).toHaveLength(1);
  });
});

describe('retirements', () => {
  it('reports a retired rulebook tree on both paths, as pending in a dry run and as done in a live one', () => {
    const outcome = reconciled({ retirements: [{ kind: 'neutral-rulebooks', dir: '/project/.agents/rulebooks' }] });

    expect(textOf(renderDryRunReport(outcome))).toContain(
      '[dry-run] sync would retire the neutral rulebook tree /project/.agents/rulebooks',
    );
    expect(textOf(renderSyncReport(outcome))).toContain('Retired the neutral rulebook tree /project/.agents/rulebooks');
  });

  it('distinguishes a host emptied of everything but retired blocks from one merely stripped', () => {
    const emptied = reconciled({ retirements: [{ kind: 'ambient-host', hostPath: LOCAL_HOST, emptied: true }] });
    const stripped = reconciled({ retirements: [{ kind: 'ambient-host', hostPath: LOCAL_HOST, emptied: false }] });

    expect(textOf(renderSyncReport(emptied))).toContain(
      `Deleted ${LOCAL_HOST}, which held only retired rulebook blocks`,
    );
    expect(textOf(renderSyncReport(stripped))).toContain(`Retired the rulebook blocks in ${LOCAL_HOST}`);
  });
});

describe('unignored hosts', () => {
  it('warns on both paths about a host the run writes that git does not ignore', () => {
    const outcome = reconciled({ unignoredHosts: [LOCAL_HOST] });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const warning = lines.find((line) => line.text.includes('is not git-ignored'));

      expect(warning?.level).toBe('warn');
      expect(warning?.text).toContain(LOCAL_HOST);
    }
  });
});

describe('missing sources', () => {
  it('warns on both paths, naming the source and its declared path', () => {
    const outcome = reconciled({ missingSources: [{ name: 'org', dir: '/repo/guidance', declaredAs: 'path' }] });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const warning = lines.find((line) => line.text.includes('does not exist'));

      expect(warning?.level).toBe('warn');
      expect(warning?.text).toContain('"org"');
      expect(warning?.text).toContain('/repo/guidance');
    }
  });

  it('warns once per missing source', () => {
    const outcome = reconciled({
      missingSources: [
        { name: 'org', dir: '/repo/guidance', declaredAs: 'path' },
        { name: 'team', dir: '/repo/team', declaredAs: 'path' },
      ],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      expect(lines.filter((line) => line.text.includes('does not exist'))).toHaveLength(2);
    }
  });

  it('offers a path-entry source the remedies its declaration allows', () => {
    const outcome = reconciled({ missingSources: [{ name: 'org', dir: '/repo/guidance', declaredAs: 'path' }] });

    const warning = renderSyncReport(outcome).find((line) => line.text.includes('"org"'));

    expect(warning?.text).toContain('Create the directory');
    expect(warning?.text).toContain('correct the source');
  });

  it("conditions a package source's remedy on who maintains the package", () => {
    const outcome = reconciled({
      missingSources: [
        { name: '@acme/guidance', dir: '/repo/node_modules/@acme/guidance/content', declaredAs: 'package' },
      ],
    });

    const warning = renderSyncReport(outcome).find((line) => line.text.includes('@acme/guidance'));

    expect(warning?.text).toContain('names that path');
    expect(warning?.text).toContain('if you maintain the package');
    expect(warning?.text).toContain('report the omission upstream');
  });
});

describe('guidance-hook advisories', () => {
  it('warns on both paths that a bound rulebook does not claim the hook route', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [{ kind: 'bound-undeclared', slug: 'layout-preferences', hook: 'impl' }],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes(ADVISORY_ANCHORS['bound-undeclared']));

      expect(advisory?.level).toBe('warn');
      expect(advisory?.text).toContain('layout-preferences');
      expect(advisory?.text).toContain('impl');
    }
  });

  it('warns on both paths that a bound rulebook also charges every session', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [
        { kind: 'bound-ambient', slug: 'layout-preferences', hook: 'impl', skills: ['implement-plan'] },
      ],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes(ADVISORY_ANCHORS['bound-ambient']));

      expect(advisory?.level).toBe('warn');
      expect(advisory?.text).toContain('layout-preferences');
      expect(advisory?.text).toContain('skill "implement-plan" declares');
    }
  });

  it('names every declaring skill when more than one creates the overlap', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [
        {
          kind: 'bound-ambient',
          slug: 'layout-preferences',
          hook: 'impl',
          skills: ['implement-plan', 'review-branch'],
        },
      ],
    });

    const advisory = renderSyncReport(outcome).find((line) => line.text.includes(ADVISORY_ANCHORS['bound-ambient']));

    expect(advisory?.text).toContain('skills "implement-plan", "review-branch" declare');
  });

  it('advises on both paths that a binding reaches no body at all', () => {
    const outcome = reconciled({ guidanceHookAdvisories: [{ kind: 'bound-unreached', hook: 'impl' }] });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes(ADVISORY_ANCHORS['bound-unreached']));

      expect(advisory?.level).toBe('info');
      expect(advisory?.text).toContain('impl');
    }
  });

  it('advises on both paths that a declared hook route is going unused', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [{ kind: 'declared-unbound', slug: 'layout-preferences' }],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes(ADVISORY_ANCHORS['declared-unbound']));

      expect(advisory?.level).toBe('info');
      expect(advisory?.text).toContain('layout-preferences');
    }
  });

  it('adds no line to either path when the declaration and the deliveries agree', () => {
    const outcome = reconciled();

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const anchors = Object.values(ADVISORY_ANCHORS);

      expect(lines.filter((line) => anchors.some((anchor) => line.text.includes(anchor)))).toEqual([]);
    }
  });
});

describe('targeting', () => {
  it('names the harness set and what settled it on both paths', () => {
    const outcome = reconciled({ targets: { harnessIds: ['claude', 'rovo'], origin: 'detection' } });

    expect(textOf(renderDryRunReport(outcome))).toContain('Targeting claude, rovo (detected in ~).');
    expect(textOf(renderSyncReport(outcome))).toContain('Targeting claude, rovo (detected in ~).');
  });
});

describe('a scope carrying no declaration', () => {
  it('tells a project scope there is nothing to sync', () => {
    const outcome: SyncOutcome = {
      kind: 'no-declaration',
      declarationPath: '/project/.agents/codeassembly.yaml',
      scope: 'project',
    };

    expect(textOf(renderSyncReport(outcome))).toBe('No .agents/codeassembly.yaml found. Nothing to sync.');
  });

  it('points the global scope at the command that creates one', () => {
    const outcome: SyncOutcome = {
      kind: 'no-declaration',
      declarationPath: '/home/.agents/codeassembly.yaml',
      scope: 'global',
    };

    expect(textOf(renderSyncReport(outcome))).toContain('codeassembly init --global');
  });
});
