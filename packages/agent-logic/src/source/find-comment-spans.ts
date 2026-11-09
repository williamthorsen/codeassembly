import type { Span } from '../schema/agent-logic-schema.ts';

/**
 * Returns the span of each HTML comment in the prompt, delimiters included, in order. An unclosed `<!--` has none, and
 * a `<!--` inside a Markdown code span or fenced code block is code rather than a comment.
 */
export function findCommentSpans(prompt: string): Span[] {
  const spans: Span[] = [];
  // Match whichever construct starts first: a fence at a line start, a backtick run, or a comment opener.
  const tokens = /^ {0,3}(`{3,}|~{3,})|`+|<!--/gm;
  for (let match = tokens.exec(prompt); match !== null; match = tokens.exec(prompt)) {
    const [token, fence] = match;
    if (fence !== undefined) {
      tokens.lastIndex = findFenceEnd(prompt, match.index + token.length, fence);
    } else if (token.startsWith('`')) {
      const closing = findClosingRun(prompt, tokens.lastIndex, token.length);
      if (closing !== undefined) tokens.lastIndex = closing;
    } else {
      const close = prompt.indexOf('-->', tokens.lastIndex);
      if (close === -1) continue;
      const end = close + '-->'.length;
      spans.push({ start: match.index, end });
      tokens.lastIndex = end;
    }
  }
  return spans;
}

// region | Helpers
/** Returns the offset after the backtick run of exactly `length` that closes a code span, if one follows. */
function findClosingRun(prompt: string, from: number, length: number): number | undefined {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let run = runs.exec(prompt); run !== null; run = runs.exec(prompt)) {
    if (run[0].length === length) return runs.lastIndex;
  }
  return undefined;
}

/** Returns the offset after the line that closes a fenced code block, or the prompt's end when nothing closes it. */
function findFenceEnd(prompt: string, from: number, fence: string): number {
  const fenceCharacter = fence.charAt(0) === '`' ? '`' : '~';
  const closing = new RegExp(String.raw`^ {0,3}${fenceCharacter}{${fence.length},}[ \t]*$`, 'gm');
  const lineEnd = prompt.indexOf('\n', from);
  if (lineEnd === -1) return prompt.length;
  closing.lastIndex = lineEnd;
  const match = closing.exec(prompt);
  return match === null ? prompt.length : closing.lastIndex;
}
// endregion | Helpers
