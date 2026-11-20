import { isFenceCloser, matchFenceOpener } from './fence.ts';
import { findCommentSpans } from './find-comment-spans.ts';

/** A line of a prompt with its offsets, excluding its newline. */
export interface Line {
  start: number;
  end: number;
  /** The 1-based line number. */
  number: number;
  text: string;
}

export type LineKind = 'blank' | 'fence' | 'item' | 'quote' | 'row' | 'skip' | 'text';

const BLOCKQUOTE = /^\s*>/;
export const HEADING = /^ {0,3}(#{1,6})(?:\s|$)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
export const LIST_MARKER = /^(?:[-*+]|\d+[.)])/;
const LONE_TAG = /^\s*<\/?[A-Za-z][\w-]*>\s*$/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/;
const THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

/** Replaces each HTML comment with spaces, keeping its newlines, so that offsets and line numbers stay the same. */
export function blankComments(prompt: string): string {
  let result = '';
  let from = 0;
  for (const { start, end } of findCommentSpans(prompt)) {
    result += prompt.slice(from, start) + prompt.slice(start, end).replaceAll(/[^\n]/g, ' ');
    from = end;
  }
  return result + prompt.slice(from);
}

/**
 * Returns what the line at the index is, as far as cutting the prompt into blocks goes. Headings, thematic breaks,
 * table header and separator rows, and lines that hold only an HTML tag are `skip`, because they hold no instruction.
 */
export function classifyLine(lines: Line[], index: number): LineKind {
  const text = lines[index]?.text ?? '';
  if (matchFenceOpener(text) !== undefined) return 'fence';
  if (text.trim() === '') return 'blank';
  if (HEADING.test(text) || THEMATIC_BREAK.test(text) || LONE_TAG.test(text)) return 'skip';
  if (TABLE_ROW.test(text)) {
    const next = lines[index + 1];
    const isHeader = next !== undefined && TABLE_SEPARATOR.test(next.text);
    return TABLE_SEPARATOR.test(text) || isHeader ? 'skip' : 'row';
  }
  if (LIST_ITEM.test(text)) return 'item';
  if (BLOCKQUOTE.test(text)) return 'quote';
  return 'text';
}

/** Returns the index of the line that closes the fence opened at the index, or the last line's when nothing does. */
export function findFenceClose(lines: Line[], opening: number): number {
  const fence = matchFenceOpener(lines[opening]?.text ?? '');
  if (fence === undefined) return opening;
  for (let index = opening + 1; index < lines.length; index++) {
    if (isFenceCloser(lines[index]?.text ?? '', fence)) return index;
  }
  return lines.length - 1;
}

/** Returns the number of leading whitespace characters of the line. */
export function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

/** Returns the index of the first line after a YAML front matter that opens the prompt, or 0 when it has none. */
export function skipFrontMatter(lines: Line[]): number {
  if (lines[0]?.text !== '---') return 0;
  const close = lines.findIndex((line, index) => index > 0 && line.text === '---');
  return close === -1 ? 0 : close + 1;
}

/** Splits the text into lines with their offsets, excluding each line's newline. */
export function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const [index, rawLine] of text.split('\n').entries()) {
    // A CRLF ending leaves `\r` on the line, which is no part of its text.
    const lineText = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    lines.push({ start, end: start + lineText.length, number: index + 1, text: lineText });
    start += rawLine.length + 1;
  }
  return lines;
}
