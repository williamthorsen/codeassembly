import {
  blankComments,
  classifyLine,
  findFenceClose,
  indentOf,
  type Line,
  type LineKind,
  skipFrontMatter,
  splitLines,
} from '../source/prompt-lines.ts';

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
/** Returns whether the paragraph is one line that ends with a colon, which introduces what follows it. */
function isLeadIn(text: string): boolean {
  return !text.includes('\n') && text.trimEnd().endsWith(':');
}
// endregion | Helpers
