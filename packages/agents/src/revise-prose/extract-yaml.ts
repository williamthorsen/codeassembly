/**
 * Prose extraction for YAML, whose prose is delimited three ways: a `#` comment, a block scalar, and a scalar value
 * carrying enough words to read as prose rather than as data.
 *
 * The file is parsed once. The parse yields every scalar's bounds, which is what tells a `#` inside a block scalar
 * from one that opens a comment, and the comments themselves are found by a line pass over what the scalars leave,
 * the syntax tree recording no line for a comment.
 */
import { LineCounter, parseAllDocuments, Scalar, visit } from 'yaml';

import { findHashCommentStart } from './hash-comments.ts';
import { isProseLiteral } from './span-text.ts';
import type { ProseSpan } from './types.ts';

/** Raised where YAML cannot be parsed, no scalar's bounds being trustworthy once the parser reports an error. */
export class UnparsableYamlError extends Error {}

/**
 * Extracts every block of prose from one YAML document stream: its comments, its block scalars, and every scalar value
 * that reads as prose. Spans come back in source order. Throws {@link UnparsableYamlError} where the parse fails.
 */
export function extractYamlProse(input: { file: string; content: string }): ProseSpan[] {
  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(input.content, { lineCounter });
  const failure = documents.flatMap((document) => document.errors)[0];
  if (failure !== undefined) throw new UnparsableYamlError(failure.message);

  const spans: ProseSpan[] = [];
  // Every line a scalar continues onto, which the comment pass skips: a `#` there is content the scalar carries.
  const continued = new Set<number>();

  for (const document of documents) {
    visit(document, {
      Scalar(key, node) {
        // A mapping key names a field rather than reading as prose, and it opens no region a comment could hide in.
        if (key === 'key') return;
        const span = buildScalarSpan({ file: input.file, content: input.content, node, lineCounter, continued });
        if (span !== undefined) spans.push(span);
      },
    });
  }

  spans.push(...extractComments(input, continued));
  return spans.toSorted((left, right) => left.line - right.line);
}

// region | Helpers

/**
 * Builds one span from a scalar, recording the lines it continues onto whether or not it yields prose. A scalar on one
 * source line contributes its parsed value; one spanning several contributes its source slice, whose newlines are the
 * source's own and so keep the span's line mapping true where a folded scalar's parsed value would not.
 */
function buildScalarSpan(input: {
  file: string;
  content: string;
  node: Scalar;
  lineCounter: LineCounter;
  continued: Set<number>;
}): ProseSpan | undefined {
  const { node } = input;
  const start = node.range?.[0];
  const end = node.range?.[1];
  if (typeof node.value !== 'string' || start === undefined || end === undefined) return undefined;

  const source = input.content.slice(start, end).trimEnd();
  const startLine = input.lineCounter.linePos(start).line;
  const endLine = input.lineCounter.linePos(start + source.length).line;
  for (let line = startLine + 1; line <= endLine; line += 1) input.continued.add(line);

  if (!isProseLiteral(node.value)) return undefined;
  if (startLine === endLine) return { file: input.file, line: startLine, text: node.value };

  if (node.type === Scalar.BLOCK_LITERAL || node.type === Scalar.BLOCK_FOLDED) {
    // The header line carries the indicator rather than prose, so the span opens on the line after it.
    const body = source.slice(source.indexOf('\n') + 1);
    return { file: input.file, line: startLine + 1, text: stripCommonIndent(body) };
  }
  return { file: input.file, line: startLine, text: stripContinuationIndent(stripQuotes(source)) };
}

/** Extracts the `#` comments outside every scalar, consecutive lines joining so a wrapped sentence survives. */
function extractComments(input: { file: string; content: string }, continued: ReadonlySet<number>): ProseSpan[] {
  const spans: ProseSpan[] = [];
  let block: { line: number; texts: string[] } | undefined;

  function flush(): void {
    if (block !== undefined) spans.push({ file: input.file, line: block.line, text: block.texts.join('\n') });
    block = undefined;
  }

  for (const [index, raw] of input.content.split('\n').entries()) {
    const line = index + 1;
    const start = continued.has(line) ? -1 : findHashCommentStart(raw);
    if (start === -1) {
      flush();
      continue;
    }
    const text = raw.slice(start).replace(/^#+/, '').trim();
    if (block !== undefined && block.line + block.texts.length === line) {
      block.texts.push(text);
    } else {
      flush();
      block = { line, texts: [text] };
    }
  }

  flush();
  return spans;
}

/** Removes the indentation a block scalar's body shares, which is the syntax holding it under its key. */
function stripCommonIndent(body: string): string {
  const lines = body.split('\n');
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(common)).join('\n');
}

/** Removes the indentation holding a scalar's continuation lines, the first line's own offset being its key's. */
function stripContinuationIndent(text: string): string {
  return text
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.replace(/^[ \t]+/, '')))
    .join('\n');
}

/** Removes the quotes delimiting a quoted scalar, which are syntax rather than part of what a reader reads. */
function stripQuotes(source: string): string {
  const opener = source[0];
  return opener === '"' || opener === "'" ? source.slice(1, -1) : source;
}

// endregion | Helpers
