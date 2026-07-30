import { describe, expect, it } from 'vitest';

import { extractInvocationEdges, type InvocationSigils, rewriteInvocationTokens } from '../invocation-tokens.ts';

const CLAUDE_SIGILS: InvocationSigils = { skillSigil: '/', subagentSigil: '' };
const ROVO_SIGILS: InvocationSigils = { skillSigil: '!', subagentSigil: '' };

describe(extractInvocationEdges, () => {
  it('returns empty groups when no tokens are present', () => {
    expect(extractInvocationEdges('No tokens here.')).toEqual({ skills: [], subagents: [] });
  });

  it('groups slugs by kind', () => {
    const content = 'Run {skill:plan} and {subagent:planner}, then {skill:review-branch}.';
    expect(extractInvocationEdges(content)).toEqual({
      skills: ['plan', 'review-branch'],
      subagents: ['planner'],
    });
  });

  it('ignores non-token text and malformed tokens', () => {
    const content = 'Prose {skill:commit} and {skill:} and {tool:Read} and {subagent:9bad}.';
    expect(extractInvocationEdges(content)).toEqual({ skills: ['commit'], subagents: [] });
  });

  it('returns slugs in source order without deduping repeats', () => {
    const content = '{skill:commit} then {skill:commit} again.';
    expect(extractInvocationEdges(content)).toEqual({ skills: ['commit', 'commit'], subagents: [] });
  });
});

describe(rewriteInvocationTokens, () => {
  it('returns content unchanged when no tokens are present', () => {
    const content = 'Plain prose mentioning a skill but using no token.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS)).toBe(content);
  });

  it('renders a skill token as the skill sigil plus the slug', () => {
    expect(rewriteInvocationTokens('Invoke {skill:capture-event} now.', CLAUDE_SIGILS)).toBe(
      'Invoke /capture-event now.',
    );
    expect(rewriteInvocationTokens('Invoke {skill:capture-event} now.', ROVO_SIGILS)).toBe(
      'Invoke !capture-event now.',
    );
  });

  it('renders a subagent token as the bare slug when the sigil is empty', () => {
    expect(rewriteInvocationTokens('Dispatch {subagent:code-reviewer}.', CLAUDE_SIGILS)).toBe(
      'Dispatch code-reviewer.',
    );
    expect(rewriteInvocationTokens('Dispatch {subagent:code-reviewer}.', ROVO_SIGILS)).toBe('Dispatch code-reviewer.');
  });

  it('renders a subagent token with a non-empty sigil', () => {
    const sigils: InvocationSigils = { skillSigil: '/', subagentSigil: '@' };
    expect(rewriteInvocationTokens('Dispatch {subagent:code-reviewer}.', sigils)).toBe('Dispatch @code-reviewer.');
  });

  it('handles hyphenated multi-segment slugs', () => {
    expect(rewriteInvocationTokens('{skill:plan-orchestrable-steps}', CLAUDE_SIGILS)).toBe('/plan-orchestrable-steps');
  });

  it('renders multiple tokens of both kinds on a single line', () => {
    const content = 'First {skill:plan}, then {subagent:planner}, then {skill:review-branch}.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS)).toBe('First /plan, then planner, then /review-branch.');
  });

  it('preserves adjacent prose and inline-code backticks around a token', () => {
    expect(rewriteInvocationTokens('Use `{skill:commit}` here.', CLAUDE_SIGILS)).toBe('Use `/commit` here.');
  });

  it('does not match a token whose slug is not letter-led', () => {
    const content = 'Not tokens: {skill:9lives} and {skill:-leading-hyphen}.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS)).toBe(content);
  });

  it('does not match an empty slug or an unknown kind', () => {
    const content = 'Not tokens: {skill:} and {agent:foo} and {tool:Read}.';
    expect(rewriteInvocationTokens(content, CLAUDE_SIGILS)).toBe(content);
  });
});
