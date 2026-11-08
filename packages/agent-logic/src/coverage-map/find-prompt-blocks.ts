import { findCommentSpans } from '../source/find-comment-spans.ts';

/** A paragraph, list item, table body row, or fenced block of a prompt, which a coverage map must quote. */
export interface PromptBlock {
  start: number;
  end: number;
  /** The 1-based number of the block's first line. */
  line: number;
}

type BlockKind = 'fence' | 'item' | 'paragraph' | 'quote';

interface OpenBlock extends PromptBlock {
  kind: BlockKind;
}

interface Line {
  start: number;
  end: number;
  number: number;
  text: string;
}

type LineKind = 'blank' | 'fence' | 'item' | 'quote' | 'row' | 'skip' | 'text';

const BLOCKQUOTE = /^\s*>/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const LONE_TAG = /^\s*<\/?[A-Za-z][\w-]*>\s*$/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/;
const THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Cuts the prompt into the blocks that hold its instructions. A list item runs to the next item at any depth and
 * keeps an indented paragraph that follows it; a line without a marker continues the block before it. Headings,
 * thematic breaks, table header and separator rows, lines that hold only an HTML tag, a leading YAML front matter,
 * and HTML comments hold no instruction, so they are not blocks. A one-line paragraph that ends with a colon, such as
 * "Example:", introduces the fenced block after it and belongs to that block, since a prompt may repeat it verbatim.
 */
export function findPromptBlocks(prompt: string): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  const source = blankComments(prompt);
  const lines = splitLines(source);
  let current: OpenBlock | undefined;
  let afterBlank = false;

  /** Closes the open block, if any. */
  function flush(): void {
    if (current !== undefined) blocks.push({ start: current.start, end: current.end, line: current.line });
    current = undefined;
    afterBlank = false;
  }

  /** Opens a block of the kind at the line. */
  function open(kind: BlockKind, line: Line): void {
    flush();
    current = { kind, start: line.start + indentOf(line.text), end: line.end, line: line.number };
  }

  /** Extends the open block to the line when `continues` holds, and otherwise opens a block of the kind there. */
  function continueOrOpen(kind: BlockKind, line: Line, continues: boolean): void {
    if (current !== undefined && continues) {
      current.end = line.end;
      afterBlank = false;
    } else {
      open(kind, line);
    }
  }

  /** Takes the fence that opens at the index into one block, and returns the index of its closing line. */
  function takeFence(line: Line, index: number): number {
    if (current?.kind === 'paragraph' && isLeadIn(source.slice(current.start, current.end))) current.kind = 'fence';
    else open('fence', line);
    const closing = findFenceClose(lines, index);
    if (current !== undefined) current.end = (lines[closing] ?? line).end;
    flush();
    return closing;
  }

  /** Continues the open block with a line without a marker, or opens a paragraph at it. */
  function takeText(line: Line): void {
    // A blank line ends the open block, unless the line after it is indented under an item.
    const continues = !afterBlank || (current?.kind === 'item' && indentOf(line.text) >= 2);
    continueOrOpen('paragraph', line, continues);
  }

  const handlers: Record<LineKind, (line: Line, index: number) => number | undefined> = {
    blank: () => {
      afterBlank = current !== undefined;
    },
    fence: takeFence,
    item: (line) => {
      open('item', line);
    },
    quote: (line) => {
      continueOrOpen('quote', line, current?.kind === 'quote' && !afterBlank);
    },
    row: (line) => {
      open('paragraph', line);
      flush();
    },
    skip: () => {
      flush();
    },
    text: (line) => {
      takeText(line);
    },
  };

  for (let index = skipFrontMatter(lines); index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) break;
    index = handlers[classifyLine(lines, index)](line, index) ?? index;
  }
  flush();
  return blocks;
}

// region | Helpers
/** Replaces each HTML comment with spaces, keeping its newlines, so that offsets and line numbers stay the same. */
function blankComments(prompt: string): string {
  let result = '';
  let from = 0;
  for (const { start, end } of findCommentSpans(prompt)) {
    result += prompt.slice(from, start) + prompt.slice(start, end).replaceAll(/[^\n]/g, ' ');
    from = end;
  }
  return result + prompt.slice(from);
}

/** Returns what the line at the index is, as far as cutting the prompt into blocks goes. */
function classifyLine(lines: Line[], index: number): LineKind {
  const text = lines[index]?.text ?? '';
  if (FENCE.test(text)) return 'fence';
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
function findFenceClose(lines: Line[], opening: number): number {
  const fence = FENCE.exec(lines[opening]?.text ?? '')?.[1] ?? '```';
  const character = fence.charAt(0) === '`' ? '`' : '~';
  const closing = new RegExp(String.raw`^ {0,3}${character}{${fence.length},}[ \t]*$`);
  for (let index = opening + 1; index < lines.length; index++) {
    if (closing.test(lines[index]?.text ?? '')) return index;
  }
  return lines.length - 1;
}

/** Returns the number of leading whitespace characters of the line. */
function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

/** Returns whether the paragraph is one line that ends with a colon, which introduces what follows it. */
function isLeadIn(text: string): boolean {
  return !text.includes('\n') && text.trimEnd().endsWith(':');
}

/** Returns the index of the first line after a YAML front matter that opens the prompt, or 0 when it has none. */
function skipFrontMatter(lines: Line[]): number {
  if (lines[0]?.text !== '---') return 0;
  const close = lines.findIndex((line, index) => index > 0 && line.text === '---');
  return close === -1 ? 0 : close + 1;
}

/** Splits the text into lines with their offsets, excluding each line's newline. */
function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const [index, lineText] of text.split('\n').entries()) {
    lines.push({ start, end: start + lineText.length, number: index + 1, text: lineText });
    start += lineText.length + 1;
  }
  return lines;
}
// endregion | Helpers
