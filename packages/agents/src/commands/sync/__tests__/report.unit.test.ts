import { describe, expect, it } from 'vitest';

import { GROWTH_CEILING_BYTES, type SizeReport } from '../../../deployed-sizes/build-size-report.ts';
import type { SizeAggregates } from '../../../deployed-sizes/types.ts';
import type { SizeReportOutcome } from '../record-deployed-sizes.ts';
import { renderDryRunReport, renderSyncReport } from '../report.ts';
import type { SyncOutcome, SyncPlan } from '../sync-plan.ts';
import { buildSyncPlan } from '../test-utils/build-sync-plan.ts';

const HOME_HOST = '/home/.claude/CLAUDE.md';
const LOCAL_HOST = '/project/CLAUDE.local.md';

/**
 * A phrase unique to each guidance-hook advisory's rendered line. Shared so that the per-kind tests and the
 * nothing-rendered test anchor on one set: A phrase that appears in only some kinds' lines would let the latter
 * pass while a regression emits one of the others.
 */
const ADVISORY_ANCHORS = {
  'bound-undeclared': 'whose delivery does not name',
  'bound-unreached': 'the binding delivers nothing',
  'declared-unbound': 'guidance-hook delivery that nothing binds',
} as const;

/** Wraps a plan as the outcome returned by a completed reconciliation. */
function reconciled(overrides: Partial<SyncPlan> = {}): SyncOutcome {
  return { kind: 'reconciled', plan: buildSyncPlan(overrides) };
}

/** Aggregates stating zero throughout, which a size assertion overrides where it reads them. */
function zeroAggregates(): SizeAggregates {
  return {
    alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
    onInvocation: 0,
    assets: 0,
  };
}

/** A reconciled outcome carrying one measured size report, stated only in the fields that an assertion reads. */
function withSizes(report: Partial<SizeReport>): SyncOutcome {
  const sizes: SizeReportOutcome = {
    kind: 'measured',
    report: {
      changes: [],
      warnings: [],
      drift: { rows: [], omittedCount: 0 },
      aggregates: zeroAggregates(),
      documentCount: 0,
      isFirstRecorded: false,
      ...report,
    },
  };
  return { kind: 'reconciled', plan: buildSyncPlan(), sizes };
}

/** The text of every line produced by one renderer, joined as the terminal would show it. */
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

  it('says the ambient region is stripped when the host survives it', () => {
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
      '⚠️ Skipping ambient retraction: /project/AGENTS.local.md has a damaged ambient region. ' +
      'Repair the codeassembly-ambient markers and re-run, or the withdrawn guidance keeps loading.';

    expect(textOf(renderSyncReport(reconciled({ droppedHarnesses: [damaged] })))).toContain(warning);
    expect(textOf(renderDryRunReport(reconciled({ droppedHarnesses: [damaged] })))).toContain(warning);
  });

  it('names no ambient action for a damaged host, whose block contains only the other removals', () => {
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
      `Deleted ${LOCAL_HOST}, which contained only retired rulebook blocks`,
    );
    expect(textOf(renderSyncReport(stripped))).toContain(`Retired the rulebook blocks in ${LOCAL_HOST}`);
  });
});

describe('unignored hosts', () => {
  it('warns on both paths about a host that the run writes and git does not ignore', () => {
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

  it('offers a path-entry source the remedies allowed by its declaration', () => {
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
    expect(warning?.text).toContain('if this project maintains the package');
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

describe('deployed sizes', () => {
  it('states each changed document, its change, and its size after the deployment', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          changes: [
            { kind: 'resized', key: 'claude/skills/plan/SKILL.md', bytes: 12_698, delta: 1_331, explained: 0 },
            { kind: 'added', key: 'claude/skills/new/SKILL.md', bytes: 512, delta: 512, explained: 0 },
            { kind: 'removed', key: 'claude/skills/old/SKILL.md', bytes: 0, delta: -8_294, explained: 0 },
          ],
        }),
      ),
    );

    expect(output).toContain('Deployed sizes:');
    expect(output).toContain('+1.3 KiB  claude/skills/plan/SKILL.md  (12.4 KiB)');
    expect(output).toContain('+512 B  claude/skills/new/SKILL.md  (added, 512 B)');
    expect(output).toContain('-8.1 KiB  claude/skills/old/SKILL.md  (removed)');
  });

  it('states a changed partial once, naming the explained bytes, its own delta, its documents, and its size', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          changes: [
            {
              kind: 'expansion',
              key: 'partial:library/_partials/plain-speech.md',
              bytes: 1_229,
              delta: 132,
              explainedDocumentCount: 17,
            },
          ],
        }),
      ),
    );

    expect(output).toContain('+2.2 KiB  library/_partials/plain-speech.md  (+132 B × 17 documents, 1.2 KiB)');
  });

  it('states one document for a partial that explains one document', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          changes: [
            {
              kind: 'expansion',
              key: 'partial:library/_partials/only.md',
              bytes: 300,
              delta: 100,
              explainedDocumentCount: 1,
            },
          ],
        }),
      ),
    );

    expect(output).toContain('× 1 document,');
  });

  it('marks a document line as a residual when its partials explain part of its growth', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          changes: [
            { kind: 'resized', key: 'claude/skills/plan/SKILL.md', bytes: 73_600, delta: 1_000, explained: 400 },
          ],
        }),
      ),
    );

    expect(output).toContain('+600 B  claude/skills/plan/SKILL.md  (residual, 71.9 KiB)');
  });

  it('aligns the delta column across both kinds of change', () => {
    const lines = renderSyncReport(
      withSizes({
        changes: [
          {
            kind: 'expansion',
            key: 'partial:library/_partials/wide.md',
            bytes: 300,
            delta: 500,
            explainedDocumentCount: 20,
          },
          { kind: 'resized', key: 'a.md', bytes: 1_100, delta: 100, explained: 0 },
        ],
      }),
    );
    const changeLines = lines.filter((line) => line.text.includes('  (')).map((line) => line.text);

    expect(changeLines).toStrictEqual([
      '  +9.8 KiB  library/_partials/wide.md  (+500 B × 20 documents, 300 B)',
      '    +100 B  a.md  (1.1 KiB)',
    ]);
  });

  it('states the three aggregates and the command that ranks every document', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          documentCount: 3,
          aggregates: {
            alwaysLoaded: { total: 3_072, ambientRegions: 1_024, skillDescriptions: 1_536, subagentDescriptions: 512 },
            onInvocation: 2_048,
            assets: 600_000,
          },
        }),
      ),
    );

    expect(output).toContain('Always loaded:  3.0 KiB');
    expect(output).toContain('On invocation:  2.0 KiB across 3 document(s)');
    expect(output).toContain('Assets:         585.9 KiB');
    expect(output).toContain('Run `codeassembly sizes` to rank every deployed document by size.');
  });

  it('states the aggregates and the closing line alone when nothing changed', () => {
    const lines = renderSyncReport(withSizes({}));
    const output = textOf(lines);

    expect(output).toContain('Deployed sizes:');
    expect(output).toContain('Always loaded:');
    expect(lines.filter((line) => line.text.includes('  ('))).toEqual([]);
  });

  it('says that a deployment is the first recorded one, and warns about nothing', () => {
    const output = textOf(renderSyncReport(withSizes({ isFirstRecorded: true })));

    expect(output).toContain('This is the first recorded deployment here, so nothing is compared to it.');
  });

  it('names the streamlining skill for a document whose source the reader maintains', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({ warnings: [{ key: 'claude/skills/plan/SKILL.md', bytes: 12_698, mayStreamline: true }] }),
      ),
    );

    expect(output).toContain('claude/skills/plan/SKILL.md has passed the 5.0 KiB growth ceiling (12.4 KiB).');
    expect(output).toContain('Run the `streamline-guidance` skill on its source to reduce it.');
  });

  it('withholds the streamlining skill for a document whose source the reader does not maintain', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({ warnings: [{ key: 'claude/skills/plan/SKILL.md', bytes: 12_698, mayStreamline: false }] }),
      ),
    );

    expect(output).toContain('has passed the 5.0 KiB growth ceiling');
    expect(output).not.toContain('streamline-guidance');
  });

  it('sends each growth warning to the warning stream and the rest of the block to the info stream', () => {
    const lines = renderSyncReport(
      withSizes({
        changes: [{ kind: 'resized', key: 'a.md', bytes: GROWTH_CEILING_BYTES, delta: 1, explained: 0 }],
        warnings: [{ key: 'a.md', bytes: GROWTH_CEILING_BYTES, mayStreamline: false }],
      }),
    );

    expect(lines.filter((line) => line.level === 'warn').map((line) => line.text)).toEqual([
      '⚠️ a.md has passed the 5.0 KiB growth ceiling (5.0 KiB).',
    ]);
  });

  it("lists each document that has grown since the review that last read it, with that review's date", () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          drift: {
            rows: [
              {
                key: 'claude/skills/plan/SKILL.md',
                bytes: 12_698,
                growth: 2_048,
                reviewedAt: '2026-09-01T08:00:00.000Z',
              },
              {
                key: 'claude/skills/wrap-up/SKILL.md',
                bytes: 4_096,
                growth: 512,
                reviewedAt: '2026-08-12T08:00:00.000Z',
              },
            ],
            omittedCount: 0,
          },
        }),
      ),
    );

    expect(output).toContain('Grown since last streamlined:');
    expect(output).toContain('+2.0 KiB  claude/skills/plan/SKILL.md  (reviewed 2026-09-01)');
    expect(output).toContain('+512 B  claude/skills/wrap-up/SKILL.md  (reviewed 2026-08-12)');
  });

  it('counts the grown documents past the cap rather than listing them', () => {
    const output = textOf(
      renderSyncReport(
        withSizes({
          drift: {
            rows: [{ key: 'a.md', bytes: 2_048, growth: 1_024, reviewedAt: '2026-09-01T08:00:00.000Z' }],
            omittedCount: 3,
          },
        }),
      ),
    );

    expect(output).toContain('and 3 more document(s) grown since their review');
  });

  it('prints no drift block when nothing has grown since its review', () => {
    const output = textOf(renderSyncReport(withSizes({})));

    expect(output).not.toContain('Grown since last streamlined:');
  });

  it('states one warning and nothing else when the pass failed', () => {
    const outcome: SyncOutcome = {
      kind: 'reconciled',
      plan: buildSyncPlan(),
      sizes: { kind: 'failed', message: 'EACCES: permission denied' },
    };
    const output = textOf(renderSyncReport(outcome));

    expect(output).toContain("⚠️ The deployment's sizes were not recorded: EACCES: permission denied");
    expect(output).not.toContain('Deployed sizes:');
  });

  it('states nothing at all for an outcome carrying no sizes, as a dry run does', () => {
    expect(textOf(renderSyncReport(reconciled()))).not.toContain('Deployed sizes:');
    expect(textOf(renderDryRunReport(reconciled()))).not.toContain('Deployed sizes:');
  });
});

describe('a scope with no declaration', () => {
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
