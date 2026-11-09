/** The character and length of the run that opens a fenced code block. */
export interface Fence {
  character: '`' | '~';
  length: number;
}

const OPENER = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/**
 * Returns whether the line closes the fence: a run of the fence's character at least as long as its opener, alone on
 * the line. The line excludes its `\r`. Any indentation is accepted, so that a fence nested in a list item closes.
 */
export function isFenceCloser(line: string, fence: Fence): boolean {
  const run = line.trim();
  return run.length >= fence.length && [...run].every((character) => character === fence.character);
}

/**
 * Returns the fence that the line opens, if any. The line excludes its `\r`. Any indentation is accepted, so that a
 * fence nested in a list item opens. A backtick run followed by another backtick on its line opens an inline code span
 * instead, as in CommonMark.
 */
export function matchFenceOpener(line: string): Fence | undefined {
  const match = OPENER.exec(line);
  const run = match?.[1];
  if (run === undefined) return undefined;
  const character = run.startsWith('`') ? '`' : '~';
  if (character === '`' && match?.[2]?.includes('`') === true) return undefined;
  return { character, length: run.length };
}
