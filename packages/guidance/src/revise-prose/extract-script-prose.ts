import { findHashCommentStart } from './hash-comments.ts';
import { countNewlines, isProseLiteral } from './span-text.ts';
import type { ProseSpan } from './types.ts';

/** Characters that the script scanner passes over between tokens. */
const SCRIPT_SPACING: ReadonlySet<string> = new Set([' ', '\t', '\r']);

/** Quote characters opening a string literal, whose multi-word contents are shown to a reader. */
const STRING_DELIMITERS: ReadonlySet<string> = new Set(['"', "'", '`']);

/** Characters that may precede a `/` that opens a regular expression, which distinguishes one from a division. */
const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '<', '>']);

/**
 * Extracts comments and multi-word string literals from TypeScript or JavaScript. The literals are what a reader
 * sees as help text, error messages, and test titles; a data literal comes along with them, which is over-inclusion
 * that the agent filters. Consecutive `//` lines join into one block so that a wrapped sentence survives the scan.
 */
export function extractScriptProse(file: string, content: string): ProseSpan[] {
  const spans: ProseSpan[] = [];
  let lineComment: { line: number; texts: string[] } | undefined;

  function flushLineComment(): void {
    if (lineComment !== undefined) {
      spans.push({ file, line: lineComment.line, text: lineComment.texts.join('\n') });
    }
    lineComment = undefined;
  }

  let line = 1;
  let previousCode = '';

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? '';

    if (char === '\n') {
      line += 1;
      continue;
    }
    if (SCRIPT_SPACING.has(char)) continue;

    if (char === '/' && content[index + 1] === '/') {
      const end = findLineEnd(content, index);
      const text = stripCommentMarkers(content.slice(index + 2, end));
      if (lineComment !== undefined && lineComment.line + lineComment.texts.length === line) {
        lineComment.texts.push(text);
      } else {
        flushLineComment();
        lineComment = { line, texts: [text] };
      }
      index = end - 1;
      continue;
    }
    flushLineComment();

    if (char === '/' && content[index + 1] === '*') {
      const closer = content.indexOf('*/', index + 2);
      const stop = closer === -1 ? content.length : closer;
      const body = content.slice(index + 2, stop);
      const span = buildBlockCommentSpan(file, line, body);
      if (span !== undefined) spans.push(span);
      line += countNewlines(body);
      index = stop + 1;
      previousCode = '/';
      continue;
    }

    if (char === '/' && REGEX_PRECEDERS.has(previousCode)) {
      index = skipRegexLiteral(content, index) - 1;
      continue;
    }

    if (STRING_DELIMITERS.has(char)) {
      const end = findStringEnd(content, index, char);
      const body = content.slice(index + 1, Math.min(end, content.length));
      if (isProseLiteral(body)) {
        spans.push({ file, line, text: body });
      }
      line += countNewlines(body);
      index = end;
      previousCode = char;
      continue;
    }

    previousCode = char;
  }

  flushLineComment();
  return spans;
}

/** Extracts `#` comments from a shell script, skipping the shebang and any `#` that falls inside a quoted string. */
export function extractShellProse(file: string, content: string): ProseSpan[] {
  const spans: ProseSpan[] = [];
  let block: { line: number; texts: string[] } | undefined;

  function flush(): void {
    if (block !== undefined) spans.push({ file, line: block.line, text: block.texts.join('\n') });
    block = undefined;
  }

  for (const [index, raw] of content.split('\n').entries()) {
    const start = index === 0 && raw.startsWith('#!') ? -1 : findHashCommentStart(raw);
    if (start === -1) {
      flush();
      continue;
    }
    const text = raw.slice(start).replace(/^#+/, '').trim();
    if (block !== undefined && block.line + block.texts.length === index + 1) {
      block.texts.push(text);
    } else {
      flush();
      block = { line: index + 1, texts: [text] };
    }
  }

  flush();
  return spans;
}

// region | Helpers

/**
 * Builds one span from a block comment's body, stripping each line's leading `*` and the blank lines contributed by
 * a `/**` opener and a closing line. The span's own line advances past each blank line dropped, so it still names the
 * source line on which its first word appears. Returns undefined for a comment that does not contain any prose at all.
 */
function buildBlockCommentSpan(file: string, line: number, body: string): ProseSpan | undefined {
  const texts = body.split('\n').map(stripCommentMarkers);
  let start = 0;
  while (start < texts.length && texts[start] === '') start += 1;
  let end = texts.length;
  while (end > start && texts[end - 1] === '') end -= 1;
  if (start === end) return undefined;
  return { file, line: line + start, text: texts.slice(start, end).join('\n') };
}

/** Returns the index of the newline ending the line on which `index` falls, or the content length if none does. */
function findLineEnd(content: string, index: number): number {
  const end = content.indexOf('\n', index);
  return end === -1 ? content.length : end;
}

/** Returns the index of the quote closing the literal opened at `start`, or the content length if none does. */
function findStringEnd(content: string, start: number, quote: string): number {
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === quote) return index;
    if (char === '\n' && quote !== '`') return index;
  }
  return content.length;
}

/** Returns the index just past a regular-expression literal opened at `start`. */
function skipRegexLiteral(content: string, start: number): number {
  let inClass = false;
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '\n') return index;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return index + 1;
  }
  return content.length;
}

/** Strips a comment's own punctuation: the `//` already removed, plus a block comment's leading `*` per line. */
function stripCommentMarkers(text: string): string {
  return text.replace(/^\s*\*+\s?/, '').trim();
}

// endregion | Helpers
