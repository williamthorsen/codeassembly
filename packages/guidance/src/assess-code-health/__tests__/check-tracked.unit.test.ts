import { describe, expect, it } from 'vitest';

import { buildFakeRunner, type RunnerCall } from '../../test-utils/fake-runner.ts';
import { checkTracked, DISPOSITIONS_HEADING, type TrackedDependencies } from '../check-tracked.ts';
import type { Proposal } from '../schemas.ts';

const COMMIT = 'c'.repeat(40);
const KEY = 'src/a.ts:long-function';

describe('checkTracked', () => {
  it('tracks a proposal disposed of in a prior file while its paths are unchanged', async () => {
    const dependencies = buildDependencies({ files: { '/prior.md': renderBlock(KEY, 'drop', null) } });

    const report = await checkTracked([buildProposal()], ['/prior.md'], '/repo', dependencies);

    expect(report.tracked).toEqual([
      expect.objectContaining({ id: 'S1', key: KEY, source: '/prior.md', reason: expect.stringMatching(/as drop/) }),
    ]);
    expect(report.untracked).toEqual([]);
  });

  it('ranks the proposal again once a path changed after the block commit', async () => {
    const dependencies = buildDependencies({ files: { '/prior.md': renderBlock(KEY, 'drop', null) }, changed: true });

    const report = await checkTracked([buildProposal()], ['/prior.md'], '/repo', dependencies);

    expect(report.tracked).toEqual([]);
    expect(report.untracked).toEqual(['S1']);
  });

  it('reads blocks from dispositions comments on the tracker', async () => {
    const dependencies = buildDependencies({
      respond: (call) => {
        if (call.args[0] === 'search') return JSON.stringify([{ number: 40 }]);
        if (call.args[0] === 'issue' && call.args[1] === 'view') {
          return JSON.stringify({ comments: [{ body: 'unrelated' }, { body: renderBlock(KEY, 'ticket', 41) }] });
        }
        return undefined;
      },
    });

    const report = await checkTracked([buildProposal()], [], '/repo', dependencies);

    expect(report.tracked[0]).toMatchObject({ source: '#40', reason: expect.stringMatching(/as ticket \(#41\)/) });
  });

  it.each([
    ['an open issue', 'OPEN', null, true],
    ['an issue closed as not planned', 'CLOSED', 'NOT_PLANNED', true],
    ['an issue closed as completed', 'CLOSED', 'COMPLETED', false],
  ])('tracks a key named by %s: %s', async (_label, state, stateReason, tracked) => {
    const dependencies = buildDependencies({
      respond: (call) =>
        call.args[1] === 'list'
          ? JSON.stringify([{ number: 7, body: `Covers ${KEY}.`, state, stateReason }])
          : undefined,
    });

    const report = await checkTracked([buildProposal()], [], '/repo', dependencies);

    expect(report.tracked.map((match) => match.source)).toEqual(tracked ? ['#7'] : []);
  });

  it('reports the tracker unchecked when gh fails, still applying prior files', async () => {
    const dependencies = buildDependencies({ files: { '/prior.md': renderBlock(KEY, 'drop', null) } });
    const { run } = buildFakeRunner(() => undefined);

    const report = await checkTracked([buildProposal()], ['/prior.md'], '/repo', { ...dependencies, run });

    expect(report.tracker.checked).toBe(false);
    expect(report.tracked.map((match) => match.source)).toEqual(['/prior.md']);
  });

  it('searches comments by the dispositions heading within the repository', async () => {
    const { calls, run } = buildFakeRunner(respondEmpty);

    await checkTracked([buildProposal()], [], '/repo', { ...buildDependencies(), run });

    const search = calls.find((call) => call.args[0] === 'search');
    expect(search?.args).toEqual(expect.arrayContaining([`"${DISPOSITIONS_HEADING}"`, '--repo', 'owner/repo']));
  });
});

// region | Helpers

/** Answers the repository lookup and returns empty results for every search. */
function respondEmpty(call: RunnerCall): string | undefined {
  if (call.args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'owner/repo' });
  if (call.args[0] === 'search' || call.args[1] === 'list') return '[]';
  return undefined;
}

/** Builds dependencies whose gh calls fall back to `respondEmpty` after `respond`. */
function buildDependencies(
  options: {
    files?: Record<string, string>;
    changed?: boolean;
    respond?: (call: RunnerCall) => string | undefined;
  } = {},
): TrackedDependencies {
  const { run } = buildFakeRunner((call) =>
    call.args[0] === 'repo' ? respondEmpty(call) : (options.respond?.(call) ?? respondEmpty(call)),
  );
  return {
    run,
    changedSince: () => options.changed ?? false,
    readFile: (file) => {
      const text = options.files?.[file];
      if (text === undefined) throw new Error(`missing fixture ${file}`);
      return text;
    },
  };
}

/** Builds a proposal with the shared key. */
function buildProposal(): Proposal {
  return {
    id: 'S1',
    title: 'Split run',
    key: KEY,
    paths: ['src/a.ts'],
    evidence: [{ kind: 'sensor', sensor: 'hotspots', detail: 'rank 1' }],
    change: 'Extract a helper.',
    strength: 'sensor',
    size: 'small',
    reach: 1,
  };
}

/** Renders a dispositions comment that ends with an evidence block for one item. */
function renderBlock(key: string, disposition: string, where: number | null): string {
  const block = {
    version: 1,
    source: 'findings.md',
    triageTicket: 30,
    commit: COMMIT,
    items: [{ id: '1', key, paths: ['src/a.ts'], disposition, where }],
  };
  return `## ${DISPOSITIONS_HEADING} findings.md\n\n<!-- codeassembly:triage-evidence v1\n${JSON.stringify(block)}\n-->\n`;
}

// endregion | Helpers
