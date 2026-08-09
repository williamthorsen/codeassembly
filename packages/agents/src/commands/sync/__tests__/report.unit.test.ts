import { describe, expect, it } from 'vitest';

import { renderDryRunReport, renderSyncReport } from '../report.ts';
import type { SyncOutcome, SyncPlan } from '../sync.ts';
import { buildSyncPlan } from '../test-utils/build-sync-plan.ts';

const HOME_HOST = '/home/.claude/CLAUDE.md';
const LOCAL_HOST = '/project/CLAUDE.local.md';

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

describe('guidance-hook advisories', () => {
  it('warns on both paths that a bound rulebook does not claim the hook route', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [{ kind: 'bound-undeclared', slug: 'layout-preferences', hook: 'impl' }],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes('whose delivery does not name'));

      expect(advisory?.level).toBe('warn');
      expect(advisory?.text).toContain('layout-preferences');
      expect(advisory?.text).toContain('impl');
    }
  });

  it('warns on both paths that a bound rulebook also charges every session', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [{ kind: 'bound-ambient', slug: 'layout-preferences', hook: 'impl' }],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes('receives its text twice'));

      expect(advisory?.level).toBe('warn');
      expect(advisory?.text).toContain('layout-preferences');
    }
  });

  it('advises on both paths that a declared hook route is going unused', () => {
    const outcome = reconciled({
      guidanceHookAdvisories: [{ kind: 'declared-unbound', slug: 'layout-preferences' }],
    });

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      const advisory = lines.find((line) => line.text.includes('guidance-hook delivery that nothing binds'));

      expect(advisory?.level).toBe('info');
      expect(advisory?.text).toContain('layout-preferences');
    }
  });

  it('adds no line to either path when the declaration and the deliveries agree', () => {
    const outcome = reconciled();

    for (const lines of [renderDryRunReport(outcome), renderSyncReport(outcome)]) {
      expect(lines.filter((line) => line.text.includes('guidance hook'))).toEqual([]);
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
