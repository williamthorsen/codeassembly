/**
 * Prose extraction for the revise-prose sweep. Extraction is per file type, each extractor stating what it reads.
 */
import path from 'node:path';

import { extractScriptProse, extractShellProse } from './extract-script-prose.ts';
import { extractYamlProse, UnparsableYamlError } from './extract-yaml.ts';
import { maskCodeSpans } from './mask-code-spans.ts';
import type { ProseKind, ProseSpan } from './types.ts';

/** File extensions whose prose the sweep reads, mapped to the extractor that reads them. */
const PROSE_KINDS_BY_EXTENSION: Readonly<Record<string, ProseKind>> = {
  '.bash': 'shell',
  '.cjs': 'script',
  '.cts': 'script',
  '.js': 'script',
  '.jsx': 'script',
  '.markdown': 'markdown',
  '.md': 'markdown',
  '.mjs': 'script',
  '.mts': 'script',
  '.sh': 'shell',
  '.ts': 'script',
  '.tsx': 'script',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.zsh': 'shell',
};

/**
 * Classifies a file by extension, which does not need a read. Returns undefined for an extension not read by any
 * extractor.
 */
export function classifyByExtension(file: string): ProseKind | undefined {
  return PROSE_KINDS_BY_EXTENSION[path.extname(file).toLowerCase()];
}

/** Classifies an extensionless file by its shebang, which is what the scripts kept by a repository have instead. */
export function classifyByShebang(content: string): ProseKind | undefined {
  return /^#![^\n]*\b(?:ba|z|k)?sh\b/.test(content) ? 'shell' : undefined;
}

/**
 * Extracts every block of prose from one file's content, classifying the file as {@link collectProse} does: by its
 * extension, or by its shebang when it has none. A file not read by any extractor, and YAML that the parser cannot
 * read, do not yield any spans.
 */
export function extractFileProse(input: { file: string; content: string }): ProseSpan[] {
  const kind = path.extname(input.file) === '' ? classifyByShebang(input.content) : classifyByExtension(input.file);
  if (kind === undefined) return [];

  try {
    return extractProse({ ...input, kind });
  } catch (error) {
    if (error instanceof UnparsableYamlError) return [];
    throw error;
  }
}

/**
 * Extracts every block of prose from one file's content, each naming the line on which it begins. Inline code spans
 * are masked on the way out, so that a detector never reads a span's content as words whatever kind the file is. Throws
 * {@link UnparsableYamlError} when the content is YAML that the parser cannot read.
 */
export function extractProse(input: { file: string; content: string; kind: ProseKind }): ProseSpan[] {
  return extractByKind(input).map((span) => ({ ...span, text: maskCodeSpans(span.text) }));
}

// region | Helpers

/** Dispatches to the extractor that reads `kind`. */
function extractByKind(input: { file: string; content: string; kind: ProseKind }): ProseSpan[] {
  switch (input.kind) {
    case 'markdown':
      return extractMarkdownProse(input.file, input.content);
    case 'script':
      return extractScriptProse(input.file, input.content);
    case 'shell':
      return extractShellProse(input.file, input.content);
    case 'yaml':
      return extractYamlProse(input);
  }
}

/**
 * Extracts a Markdown file's frontmatter through the YAML extractor, each span naming the source line on which it
 * begins. A block that the parser cannot read yields nothing rather than failing the file, whose body is prose
 * whatever its frontmatter contains.
 */
function extractFrontmatterProse(file: string, lines: readonly string[], bodyStart: number): ProseSpan[] {
  if (bodyStart === 0) return [];
  try {
    // The block opens on the line after the delimiter, which is the offset by which each span's own line advances.
    return extractYamlProse({ file, content: lines.slice(1, bodyStart - 1).join('\n') }).map((span) => ({
      ...span,
      line: span.line + 1,
    }));
  } catch (error) {
    if (error instanceof UnparsableYamlError) return [];
    throw error;
  }
}

/**
 * Extracts Markdown prose: the frontmatter's own prose, then body paragraphs, list items, headings, and table cells.
 * Fenced code, HTML comments, and link definitions are dropped, and a link is reduced to its own text so that the
 * detector does not receive any URL.
 */
function extractMarkdownProse(file: string, content: string): ProseSpan[] {
  const lines = content.split('\n');

  let index = skipFrontmatter(lines);
  const spans: ProseSpan[] = extractFrontmatterProse(file, lines, index);
  let block: { line: number; texts: string[] } | undefined;

  function flush(): void {
    if (block !== undefined && block.texts.some((text) => text.trim() !== '')) {
      spans.push({ file, line: block.line, text: block.texts.join('\n') });
    }
    block = undefined;
  }

  while (index < lines.length) {
    const raw = lines[index] ?? '';
    const trimmed = raw.trim();

    const fence = /^(?:`{3,}|~{3,})/.exec(trimmed)?.[0];
    if (fence !== undefined) {
      flush();
      index = skipFencedBlock(lines, index, fence);
      continue;
    }

    if (trimmed.startsWith('<!--')) {
      flush();
      index = skipHtmlComment(lines, index);
      continue;
    }

    if (trimmed === '' || isLinkDefinition(trimmed)) {
      flush();
      index += 1;
      continue;
    }

    if (isTableRow(trimmed)) {
      flush();
      if (!isTableDelimiterRow(trimmed)) {
        for (const cell of splitTableCells(trimmed)) {
          if (cell.trim() !== '') spans.push({ file, line: index + 1, text: normalizeMarkdownLine(cell) });
        }
      }
      index += 1;
      continue;
    }

    if (block === undefined || isBlockStart(raw)) {
      flush();
      block = { line: index + 1, texts: [] };
    }
    block.texts.push(normalizeMarkdownLine(raw));
    index += 1;
  }

  flush();
  return spans;
}

/**
 * Reports whether a line opens a new Markdown block: a heading or a list item. A `>` opens none, since every line of
 * a wrapped blockquote has one and treating each as a block start splits a construction across two spans.
 */
function isBlockStart(line: string): boolean {
  return /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(line);
}

/** Reports whether a line is a Markdown link definition, whose payload is a URL rather than prose. */
function isLinkDefinition(line: string): boolean {
  return /^\[[^\]]+]:\s/.test(line);
}

/** Reports whether a table row is the delimiter separating a header from its body. */
function isTableDelimiterRow(line: string): boolean {
  return /^\|[\s:|-]+\|?$/.test(line);
}

/** Reports whether a line is a Markdown table row, whose cells are separate prose rather than one sentence. */
function isTableRow(line: string): boolean {
  return line.startsWith('|');
}

/**
 * Strips the syntax around a Markdown line's prose: the block marker opening it, and each link's URL. The result has
 * the line's own newline count, which is zero, so a span's line mapping survives the rewrite.
 */
function normalizeMarkdownLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, '')
    .replace(/!\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)]\[[^\]]*]/g, '$1')
    .replace(/<https?:\/\/[^>]*>/g, '')
    .replace(/\bhttps?:\/\/\S+/g, '');
}

/** Returns the index of the first line past a fenced code block whose opening fence is `fence`. */
function skipFencedBlock(lines: readonly string[], start: number, fence: string): number {
  const marker = fence.startsWith('`') ? '`' : '~';
  const closer = new RegExp(String.raw`^\s*${marker}{${fence.length},}\s*$`);
  for (let index = start + 1; index < lines.length; index += 1) {
    if (closer.test(lines[index] ?? '')) return index + 1;
  }
  return lines.length;
}

/** Returns the index of the first line past a YAML frontmatter block, or 0 if the file opens with none. */
function skipFrontmatter(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---') return index + 1;
  }
  return 0;
}

/** Returns the index of the first line past an HTML comment opened at `start`. */
function skipHtmlComment(lines: readonly string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if ((lines[index] ?? '').includes('-->')) return index + 1;
  }
  return lines.length;
}

/** Splits a Markdown table row into its cells, so that one cell's prose never runs into the next. */
function splitTableCells(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|');
}

// endregion | Helpers
