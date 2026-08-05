import { describe, expect, it } from 'vitest';

import {
  extractInvocationEdges,
  type InvocationSigils,
  resolveRulebookToken,
  rewriteInvocationTokens,
  type RulebookInvocationCatalog,
} from '../invocation-tokens.ts';

const CLAUDE_SIGILS: InvocationSigils = { skillSigil: '/', subagentSigil: '' };
const ROVO_SIGILS: InvocationSigils = { skillSigil: '!', subagentSigil: '' };

// The host a rejected token is attributed to, in the content-root-relative form both transforms pass.
const HOST = 'skills/wrap-up/SKILL.md';

// `shell-conventions` carries a `skill-name` override, so its deployed name is not `consult-<slug>`.
const RULEBOOKS: RulebookInvocationCatalog = new Map([
  ['nmr-cheatsheet', { skillName: 'consult-nmr-cheatsheet', skill: false }],
  ['nmr-scripts', { skillName: 'consult-nmr-scripts', skill: true }],
  ['shell-conventions', { skillName: 'shell-rules', skill: true }],
]);

describe(extractInvocationEdges, () => {
  it('returns empty groups when no tokens are present', () => {
    expect(extractInvocationEdges('No tokens here.')).toEqual({ rulebooks: [], skills: [], subagents: [] });
  });

  it('groups slugs by kind', () => {
    const content = 'Run {skill:plan} and {subagent:planner}, see {rulebook:nmr-scripts}, then {skill:review-branch}.';
    expect(extractInvocationEdges(content)).toEqual({
      rulebooks: ['nmr-scripts'],
      skills: ['plan', 'review-branch'],
      subagents: ['planner'],
    });
  });

  it('ignores non-token text and malformed tokens', () => {
    const content = 'Prose {skill:commit} and {skill:} and {tool:Read} and {rulebook:} and {subagent:9bad}.';
    expect(extractInvocationEdges(content)).toEqual({ rulebooks: [], skills: ['commit'], subagents: [] });
  });

  it('returns slugs in source order without deduping repeats', () => {
    const content = '{skill:commit} then {skill:commit} again.';
    expect(extractInvocationEdges(content)).toEqual({ rulebooks: [], skills: ['commit', 'commit'], subagents: [] });
  });
});

describe(resolveRulebookToken, () => {
  it('resolves a skill-delivered rulebook to its deployed skill name', () => {
    expect(resolveRulebookToken('nmr-scripts', RULEBOOKS)).toEqual({
      kind: 'resolved',
      skillName: 'consult-nmr-scripts',
    });
  });

  it('resolves through a skill-name override rather than the slug', () => {
    expect(resolveRulebookToken('shell-conventions', RULEBOOKS)).toEqual({
      kind: 'resolved',
      skillName: 'shell-rules',
    });
  });

  it.each([
    {
      name: 'when no catalog is supplied, rejects as honored only in a rulebook body',
      slug: 'nmr-scripts',
      rulebooks: undefined,
      reason: /only in a rulebook body/,
    },
    {
      name: 'when the slug names no deployed rulebook, rejects as absent from the deployed set',
      slug: 'never-declared',
      rulebooks: RULEBOOKS,
      reason: /no rulebook in the deployed set/,
    },
    {
      name: 'when the target is ambient-only, rejects and names dependencies: as the alternative',
      slug: 'nmr-cheatsheet',
      rulebooks: RULEBOOKS,
      reason: /ambient-only rulebook[\s\S]*`dependencies:`/,
    },
  ])('$name', ({ slug, rulebooks, reason }) => {
    const resolution = resolveRulebookToken(slug, rulebooks);

    expect(resolution.kind).toBe('rejected');
    expect(resolution.kind === 'rejected' && resolution.reason).toMatch(reason);
  });
});

describe(rewriteInvocationTokens, () => {
  it('returns content unchanged when no tokens are present', () => {
    const content = 'Plain prose mentioning a skill but using no token.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS, HOST)).toBe(content);
  });

  it('renders a skill token as the skill sigil plus the slug', () => {
    expect(rewriteInvocationTokens('Invoke {skill:capture-event} now.', CLAUDE_SIGILS, HOST)).toBe(
      'Invoke /capture-event now.',
    );
    expect(rewriteInvocationTokens('Invoke {skill:capture-event} now.', ROVO_SIGILS, HOST)).toBe(
      'Invoke !capture-event now.',
    );
  });

  it('renders a subagent token as the bare slug when the sigil is empty', () => {
    expect(rewriteInvocationTokens('Dispatch {subagent:code-reviewer}.', CLAUDE_SIGILS, HOST)).toBe(
      'Dispatch code-reviewer.',
    );
    expect(rewriteInvocationTokens('Dispatch {subagent:code-reviewer}.', ROVO_SIGILS, HOST)).toBe(
      'Dispatch code-reviewer.',
    );
  });

  it('renders a subagent token with a non-empty sigil', () => {
    const sigils: InvocationSigils = { skillSigil: '/', subagentSigil: '@' };
    expect(rewriteInvocationTokens('Dispatch {subagent:code-reviewer}.', sigils, HOST)).toBe(
      'Dispatch @code-reviewer.',
    );
  });

  it('renders a rulebook token as the skill sigil plus the target skill name', () => {
    expect(rewriteInvocationTokens('See {rulebook:nmr-scripts}.', CLAUDE_SIGILS, HOST, RULEBOOKS)).toBe(
      'See /consult-nmr-scripts.',
    );
    expect(rewriteInvocationTokens('See {rulebook:nmr-scripts}.', ROVO_SIGILS, HOST, RULEBOOKS)).toBe(
      'See !consult-nmr-scripts.',
    );
  });

  it('renders a rulebook token through its skill-name override', () => {
    expect(rewriteInvocationTokens('See {rulebook:shell-conventions}.', CLAUDE_SIGILS, HOST, RULEBOOKS)).toBe(
      'See /shell-rules.',
    );
  });

  it.each([
    { name: 'when no catalog is supplied', rulebooks: undefined, slug: 'nmr-scripts' },
    { name: 'when the slug names no deployed rulebook', rulebooks: RULEBOOKS, slug: 'never-declared' },
    { name: 'when the target is ambient-only', rulebooks: RULEBOOKS, slug: 'nmr-cheatsheet' },
  ])('throws naming the offending token and its host $name', ({ rulebooks, slug }) => {
    expect(() => rewriteInvocationTokens(`See {rulebook:${slug}}.`, CLAUDE_SIGILS, HOST, rulebooks)).toThrow(
      new RegExp(String.raw`\{rulebook:${slug}\} in skills/wrap-up/SKILL\.md`),
    );
  });

  it('reads as one sentence when a rulebook token appears in a skill body', () => {
    expect(() => rewriteInvocationTokens('See {rulebook:nmr-scripts}.', CLAUDE_SIGILS, HOST)).toThrow(
      'Unusable invocation token {rulebook:nmr-scripts} in skills/wrap-up/SKILL.md: it is honored only in a rulebook body.',
    );
  });

  it('handles hyphenated multi-segment slugs', () => {
    expect(rewriteInvocationTokens('{skill:plan-orchestrable-steps}', CLAUDE_SIGILS, HOST)).toBe(
      '/plan-orchestrable-steps',
    );
  });

  it('renders multiple tokens of both kinds on a single line', () => {
    const content = 'First {skill:plan}, then {subagent:planner}, then {skill:review-branch}.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS, HOST)).toBe(
      'First /plan, then planner, then /review-branch.',
    );
  });

  it('preserves adjacent prose and inline-code backticks around a token', () => {
    expect(rewriteInvocationTokens('Use `{skill:commit}` here.', CLAUDE_SIGILS, HOST)).toBe('Use `/commit` here.');
  });

  it('does not match a token whose slug is not letter-led', () => {
    const content = 'Not tokens: {skill:9lives} and {skill:-leading-hyphen}.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS, HOST)).toBe(content);
  });

  it('does not match an empty slug or an unknown kind', () => {
    const content = 'Not tokens: {skill:} and {agent:foo} and {tool:Read}.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS, HOST)).toBe(content);
  });
});
