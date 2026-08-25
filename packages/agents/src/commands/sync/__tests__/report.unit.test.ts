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
      const warning = lines.find((line) => line.text.includes('does not exist, so it contributed nothing'));

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
      expect(lines.filter((line) => line.text.includes('does not exist, so it contributed nothing'))).toHaveLength(2);
    }
  });

  it('offers a path-entry source the remedies its declaration allows', () => {
    const outcome = reconciled({ missingSources: [{ name: 'org', dir: '/repo/guidance', declaredAs: 'path' }] });

    const warning = renderSyncReport(outcome).find((line) => line.text.includes('"org"'));

    expect(warning?.text).toContain('Create the directory');
    expect(warning?.text).toContain('correct the source');
  });

  it('sends a package source upstream rather than offering remedies it does not have', () => {
    const outcome = reconciled({
      missingSources: [
        { name: '@acme/guidance', dir: '/repo/node_modules/@acme/guidance/content', declaredAs: 'package' },
      ],
    });

    const warning = renderSyncReport(outcome).find((line) => line.text.includes('@acme/guidance'));

    expect(warning?.text).toContain('does not ship it');
    expect(warning?.text).toContain('Report it upstream');
    expect(warning?.text).not.toContain('Create the directory');
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
