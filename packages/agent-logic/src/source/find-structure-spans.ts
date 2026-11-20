import type { Span } from '../schema/agent-logic-schema.ts';
import {
  blankComments,
  classifyLine,
  findFenceClose,
  HEADING,
  indentOf,
  LIST_MARKER,
  skipFrontMatter,
  splitLines,
} from './prompt-lines.ts';

/** A span of Markdown syntax that structures the prompt rather than instructs. */
export type StructureSpan =
  | (Span & { kind: 'heading'; level: number; markerEnd: number })
  | (Span & { kind: 'line' })
  | (Span & { kind: 'list-marker' });

/**
 * Finds, in order, the lines that `findPromptBlocks` does not take into any block, a leading YAML front matter as one
 * span, and the marker of each list item. A heading's `markerEnd` is the offset just past its run of `#`. Text inside
 * a fenced block or an HTML comment is never structure.
 */
export function findStructureSpans(prompt: string): StructureSpan[] {
  const spans: StructureSpan[] = [];
  const lines = splitLines(blankComments(prompt));
  const first = skipFrontMatter(lines);
  const frontMatterEnd = lines[first - 1]?.end;
  if (frontMatterEnd !== undefined) spans.push({ kind: 'line', start: 0, end: frontMatterEnd });

  for (let index = first; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) break;
    const start = line.start + indentOf(line.text);
    switch (classifyLine(lines, index)) {
      case 'fence':
        index = findFenceClose(lines, index);
        break;
      case 'item': {
        const markerLength = LIST_MARKER.exec(line.text.trimStart())?.[0].length ?? 0;
        spans.push({ kind: 'list-marker', start, end: start + markerLength });
        break;
      }
      case 'skip': {
        const markerLength = HEADING.exec(line.text)?.[1]?.length;
        spans.push(
          markerLength === undefined
            ? { kind: 'line', start, end: line.end }
            : { kind: 'heading', start, end: line.end, level: markerLength, markerEnd: start + markerLength },
        );
        break;
      }
      default:
    }
  }
  return spans;
}
