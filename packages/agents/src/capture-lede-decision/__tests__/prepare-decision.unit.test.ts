import { describe, expect, it } from 'vitest';

import { prepareDecision, type PrepareDecisionOutcome } from '../prepare-decision.ts';
import type { LedeEpisode } from '../types.ts';

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';
const CAPTURED_AT = '2026-07-30T20:41:17Z';

const AGENT_LEDE = 'Rulebooks can now address a file by linking to it.';
const MERGED_LEDE = 'Rulebooks can now address a file by linking to it: a Markdown link reaches each harness.';

describe(prepareDecision, () => {
  it('writes recordType: event, so a decision joins the existing event substrate', () => {
    const content = expectContent(prepareDecision(decisionFor({})));

    expect(content).toMatch(/^recordType: event$/m);
  });

  it('carries the group, the namespaced work type, and the verdict as tags', () => {
    const content = expectContent(prepareDecision(decisionFor({ verdict: 'revised' })));

    expect(content).toMatch(/^tags: \[lede-decision, type:feat, revised]$/m);
  });

  it('carries the change identity and the doctrine fingerprint in frontmatter', () => {
    const content = expectContent(prepareDecision(decisionFor({})));

    expect(content).toMatch(/^type: feat$/m);
    expect(content).toMatch(/^tier: public$/m);
    expect(content).toMatch(/^scope: agents$/m);
    expect(content).toMatch(/^pr: '1124'$/m);
    expect(content).toMatch(/^merge-commit: 35aa58d7$/m);
    expect(content).toMatch(/^doctrine-hash: sha256:abc$/m);
  });

  it('summarizes the decision so recall names the verdict and the change', () => {
    const content = expectContent(prepareDecision(decisionFor({ verdict: 'revised' })));

    expect(content).toMatch(/^summary: 'Lede revised for agents #1124'$/m);
  });

  it('records only the agent lede when the two texts match', () => {
    const content = expectContent(prepareDecision(decisionFor({ differ: false })));

    expect(content).toContain('## Agent lede');
    expect(content).not.toContain('## Merged lede');
  });

  it('records the merged lede whenever the two texts differ', () => {
    const content = expectContent(prepareDecision(decisionFor({ differ: true })));

    expect(content).toContain(`## Merged lede\n\n${MERGED_LEDE}`);
  });

  it('records the merged lede on a differing pair even when the author called it accepted', () => {
    const content = expectContent(prepareDecision(decisionFor({ differ: true, verdict: 'accepted' })));

    expect(content).toContain('## Merged lede');
    expect(content).toMatch(/^tags: \[lede-decision, type:feat, accepted]$/m);
  });

  it('omits the comment section when no comment was given', () => {
    const content = expectContent(prepareDecision(decisionFor({ comment: '   \n' })));

    expect(content).not.toContain('## Comment');
  });

  it('records a comment when the author explained the decision', () => {
    const content = expectContent(prepareDecision(decisionFor({ comment: 'Cut the setup clause.\n' })));

    expect(content).toContain('## Comment\n\nCut the setup clause.');
  });

  it('omits every optional field the episode and context did not carry', () => {
    const content = expectContent(prepareDecision(decisionFor({})));

    expect(content).not.toMatch(/^ticket:/m);
    expect(content).not.toMatch(/^agents-version:/m);
    expect(content).not.toMatch(/^repo:/m);
    expect(content).not.toMatch(/^harness:/m);
    expect(content).not.toMatch(/^session:/m);
  });

  it('carries the optional fields the episode and context did supply', () => {
    const content = expectContent(
      prepareDecision({
        ...decisionFor({}),
        episode: { ...episodeFor({}), agentsVersion: '1.2.3', identity: { ...IDENTITY, ticket: '1107' } },
        context: { cwd: '/tmp/work', session: 'session-abc', repo: 'owner/name' },
        harness: 'claude',
      }),
    );

    expect(content).toMatch(/^ticket: '1107'$/m);
    expect(content).toMatch(/^agents-version: 1.2.3$/m);
    expect(content).toMatch(/^repo: owner\/name$/m);
    expect(content).toMatch(/^harness: claude$/m);
    expect(content).toMatch(/^session: session-abc$/m);
  });
});

// region | Helpers

const IDENTITY = {
  type: 'feat',
  tier: 'public',
  scope: 'agents',
  pr: '1124',
  mergeCommit: '35aa58d7',
} as const;

/** Builds a decision input over a minimal episode, applying the overrides a test cares about. */
function decisionFor(overrides: {
  verdict?: 'accepted' | 'revised';
  differ?: boolean;
  comment?: string;
}): Parameters<typeof prepareDecision>[0] {
  return {
    episode: episodeFor(overrides),
    verdict: overrides.verdict ?? 'revised',
    comment: overrides.comment ?? '',
    context: { cwd: '/tmp/work' },
    harness: null,
    id: ID,
    capturedAt: CAPTURED_AT,
  };
}

/** Builds a minimal resolved episode carrying no optional field unless a test supplies one. */
function episodeFor(overrides: { differ?: boolean }): LedeEpisode {
  return {
    agentLede: AGENT_LEDE,
    mergedLede: MERGED_LEDE,
    differ: overrides.differ ?? true,
    identity: { ...IDENTITY },
    doctrineHash: 'sha256:abc',
  };
}

/** Narrows a prepare outcome to its rendered content, failing the test with the validation errors when it did not. */
function expectContent(outcome: PrepareDecisionOutcome): string {
  if (outcome.ok) {
    return outcome.prepared.content;
  }
  throw new Error(`expected a prepared decision, got errors: ${outcome.errors.join('; ')}`);
}

// endregion | Helpers
