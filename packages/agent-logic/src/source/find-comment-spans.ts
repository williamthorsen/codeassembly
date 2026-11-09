import type { Span } from '../schema/agent-logic-schema.ts';
import { type Fence, isFenceCloser, matchFenceOpener } from './fence.ts';

/**
 * Returns the span of each HTML comment in the prompt, delimiters included, in order. An unclosed `<!--` has none, and
 * a `<!--` inside a Markdown code span or fenced code block is code rather than a comment.
 */
export function findCommentSpans(prompt: string): Span[] {
  const spans: Span[] = [];
  // Match whichever construct starts first: a fence at a line start, a backtick run, or a comment opener.
  const tokens = /^[ \t]*(`{3,}|~{3,})|`+|<!--/gm;
  for (let match = tokens.exec(prompt); match !== null; match = tokens.exec(prompt)) {
    const [token, run] = match;
    const fence = run === undefined ? undefined : matchFenceOpener(readLine(prompt, match.index));
    if (fence !== undefined) {
      tokens.lastIndex = findFenceEnd(prompt, match.index, fence);
    } else if (token.trimStart().startsWith('`')) {
      const length = run?.length ?? token.length;
      const closing = findClosingRun(prompt, tokens.lastIndex, length);
      if (closing !== undefined) tokens.lastIndex = closing;
    } else if (token === '<!--') {
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
/**
 * Returns the offset after the backtick run of exactly `length` that closes a code span, if one follows within the
 * paragraph, which ends at the next blank line or fence opener.
 */
function findClosingRun(prompt: string, from: number, length: number): number | undefined {
  const limit = findParagraphEnd(prompt, from);
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let run = runs.exec(prompt); run !== null && run.index < limit; run = runs.exec(prompt)) {
    if (run[0].length === length) return runs.lastIndex;
  }
  return undefined;
}

/** Returns the offset after the line that closes the fence opened at the offset, or the prompt's end when none does. */
function findFenceEnd(prompt: string, opening: number, fence: Fence): number {
  let lineEnd = prompt.indexOf('\n', opening);
  while (lineEnd !== -1) {
    const lineStart = lineEnd + 1;
    lineEnd = prompt.indexOf('\n', lineStart);
    if (isFenceCloser(readLine(prompt, lineStart), fence)) return lineEnd === -1 ? prompt.length : lineEnd;
  }
  return prompt.length;
}

/** Returns the offset of the first blank line or fence opener after the line that contains the offset. */
function findParagraphEnd(prompt: string, from: number): number {
  for (let lineEnd = prompt.indexOf('\n', from); lineEnd !== -1; lineEnd = prompt.indexOf('\n', lineEnd + 1)) {
    const line = readLine(prompt, lineEnd + 1);
    if (line.trim() === '' || matchFenceOpener(line) !== undefined) return lineEnd + 1;
  }
  return prompt.length;
}

/** Returns the text of the line from the offset to its end, excluding its newline and any `\r`. */
function readLine(prompt: string, from: number): string {
  const lineEnd = prompt.indexOf('\n', from);
  const line = prompt.slice(from, lineEnd === -1 ? prompt.length : lineEnd);
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
// endregion | Helpers
