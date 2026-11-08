import type { Span } from '../schema/agent-logic-schema.ts';
import { findCommentSpans } from '../source/find-comment-spans.ts';

const GATE_PATTERN = /<HARD-GATE>([\s\S]*?)<\/HARD-GATE>/g;

/**
 * Returns the span of each `<HARD-GATE>` body in the prompt, trimmed of surrounding whitespace, in order. An opening
 * tag without a closing tag has no body, and a tag inside an HTML comment is markup rather than a gate.
 */
export function findGateSpans(prompt: string): Span[] {
  const comments = findCommentSpans(prompt);
  const spans: Span[] = [];
  for (const match of prompt.matchAll(GATE_PATTERN)) {
    const [tag, body = ''] = match;
    if (comments.some(({ start, end }) => start <= match.index && match.index < end)) continue;
    const bodyStart = match.index + tag.indexOf(body);
    const leading = body.length - body.trimStart().length;
    const trimmed = body.trim();
    if (trimmed === '') continue;
    spans.push({ start: bodyStart + leading, end: bodyStart + leading + trimmed.length });
  }
  return spans;
}
