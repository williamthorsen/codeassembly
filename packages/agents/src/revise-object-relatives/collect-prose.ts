/**
 * Target-set resolution and prose extraction for the revise-object-relatives sweep.
 *
 * The sweep reads what git tracks plus what git would track, which respects `.gitignore` and so keeps `node_modules/`
 * and `dist/` out for free. Extraction is per file type: Markdown body text, comments and multi-word string literals
 * in TypeScript and JavaScript, and `#` comments in shell. Everything mechanical about scope is decided here, so the
 * detector sees prose alone and the agent never adjudicates a candidate from a file it may not edit.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { DEFAULT_ARTIFACT_BASE_DIR, resolveArtifactBaseDir } from '../derive-session-context/compose-manifest.ts';
import { readPreferences } from '../derive-session-context/read-preferences.ts';
import { HARNESSES } from '../lib/harness.ts';
import type { ProseKind, ProseSpan, SkipReason } from './types.ts';

/** A resolved sweep: what it read, what it held out, and every block of prose that it yielded. */
export interface ProseCollection {
  /** The resolved target set, in git's own order. Nothing outside it may be edited. */
  files: readonly string[];
  /** How many files the sweep read prose from. */
  scanned: number;
  /** Prose-bearing files held out, by the reason each was held out, so no exclusion is silent. */
  skipped: Readonly<Record<SkipReason, number>>;
  spans: readonly ProseSpan[];
}

/** Raised when the sweep is asked to run somewhere git does not track. */
export class NotARepositoryError extends Error {}

/**
 * Resolves the target set under `root` and extracts every block of prose from it. `paths` narrows the sweep to the
 * files those paths name or contain; an empty list sweeps the whole repository. Throws {@link NotARepositoryError}
 * where `root` is not inside a git working tree.
 */
export async function collectProse(input: {
  root: string;
  paths?: readonly string[];
  home?: string;
}): Promise<ProseCollection> {
  const home = input.home ?? homedir();
  const artifactBaseDir = await resolveSweepArtifactBaseDir(input.root, home);
  const files = resolveTargetFiles({ root: input.root, paths: input.paths ?? [], artifactBaseDir });

  const spans: ProseSpan[] = [];
  const skipped: Record<SkipReason, number> = { generated: 0, 'machine-generated': 0, unreadable: 0 };
  let scanned = 0;

  for (const file of files) {
    // The extension decides whether a file is worth reading at all, so a lockfile or an image is never pulled into
    // a string. Only an extensionless file falls through to the read, where a shebang is the one remaining signal.
    const extensionKind = classifyByExtension(file);
    if (extensionKind === undefined && path.extname(file) !== '') continue;

    const content = readFileSafely(path.join(input.root, file));
    if (content === undefined) {
      if (extensionKind !== undefined) skipped.unreadable += 1;
      continue;
    }

    const kind = extensionKind ?? classifyByShebang(content);
    if (kind === undefined) continue;

    if (isGeneratedContent(content)) {
      skipped.generated += 1;
      continue;
    }
    if (kind !== 'markdown' && hasMachineWidthLines(content)) {
      skipped['machine-generated'] += 1;
      continue;
    }

    scanned += 1;
    spans.push(...extractProse({ file, content, kind }));
  }

  return { files, scanned, skipped, spans };
}

/** Extracts every block of prose from one file's content, each carrying the line it begins on. */
export function extractProse(input: { file: string; content: string; kind: ProseKind }): ProseSpan[] {
  switch (input.kind) {
    case 'markdown':
      return extractMarkdownProse(input.file, input.content);
    case 'script':
      return extractScriptProse(input.file, input.content);
    case 'shell':
      return extractShellProse(input.file, input.content);
  }
}

/**
 * Lists the prose-bearing files under `root` that the sweep may edit: what git tracks plus what it would track, minus
 * the paths {@link isExcludedPath} rules out. `paths` narrows the listing; an empty list covers the repository.
 */
export function resolveTargetFiles(input: {
  root: string;
  paths: readonly string[];
  artifactBaseDir: string;
}): string[] {
  const tracked = listGitFiles(input.root, ['ls-files', '-z', '--'], input.paths);
  const untracked = listGitFiles(input.root, ['ls-files', '-z', '--others', '--exclude-standard', '--'], input.paths);

  const seen = new Set<string>();
  const files: string[] = [];
  for (const file of [...tracked, ...untracked]) {
    if (seen.has(file)) continue;
    seen.add(file);
    if (isExcludedPath({ file, root: input.root, artifactBaseDir: input.artifactBaseDir })) continue;
    files.push(file);
  }
  return files;
}

// region | Helpers

/**
 * The NUL byte, which separates `git ls-files -z` records and marks a file as binary. Built rather than written as an
 * escape, because the formatter rewrites an escape into the byte itself, and a literal NUL in a source file makes
 * `grep` treat that file as binary and skip it.
 */
const NUL = String.fromCodePoint(0);

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
  '.zsh': 'shell',
};

/** Output cap for one `git ls-files`, sized past the listing produced by a large repository. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

/**
 * Markers stamped into deployed output, each anchored to the start of a line. Every deployment writes its marker on a
 * line of its own: the provenance headline as a `#` or `<!--` comment, and an ownership or guidance-hook marker as an
 * HTML comment. A mention inside a sentence or a code span is prose about the marker, and the file carrying it is
 * authored source that the sweep must read.
 */
const GENERATED_MARKERS: readonly RegExp[] = [
  /^[ \t]*(?:#|\/\/|<!--|\*)?[ \t]*GENERATED FILE\b/m,
  /^[ \t]*<!-- codeassembly-/m,
];

/**
 * Line width above which a script is machine-generated rather than authored. A bundler emits a whole module on one
 * line, where a formatted source file stays two orders of magnitude below this. Markdown is exempt: a paragraph on
 * one line is the house convention, not a signal.
 */
const MACHINE_LINE_WIDTH = 1_000;

/** Fewest words a string literal must carry to read as prose rather than as data. */
const MIN_LITERAL_WORDS = 3;

/** Characters the script scanner passes over between tokens. */
const SCRIPT_SPACING: ReadonlySet<string> = new Set([' ', '\t', '\r']);

/** Quote characters opening a string literal, whose multi-word contents are what reaches a reader. */
const STRING_DELIMITERS: ReadonlySet<string> = new Set(['"', "'", '`']);

/** Characters that may precede a `/` that opens a regular expression, which distinguishes one from a division. */
const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '<', '>']);

/**
 * Builds one span from a block comment's body, stripping each line's leading `*` and the blank lines a `/**` opener
 * and a closing line contribute. The span's own line advances past each blank line dropped, so it still names the
 * source line its first word sits on. Returns undefined for a comment holding no prose at all.
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

/** Classifies a file by extension, which needs no read. Returns undefined for an extension read by no extractor. */
function classifyByExtension(file: string): ProseKind | undefined {
  return PROSE_KINDS_BY_EXTENSION[path.extname(file).toLowerCase()];
}

/** Classifies an extensionless file by its shebang, which is what the scripts kept by a repository carry instead. */
function classifyByShebang(content: string): ProseKind | undefined {
  return /^#![^\n]*\b(?:ba|z|k)?sh\b/.test(content) ? 'shell' : undefined;
}

/** Counts the newlines in `text`, which is how an offset within a span maps back to a source line. */
function countNewlines(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '\n') count += 1;
  }
  return count;
}

/** Counts the word-like tokens in a string literal, which is how prose is told from data. */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[a-z]{2}/i.test(word)).length;
}

/**
 * Extracts Markdown body prose: paragraphs, list items, headings, and table cells. Frontmatter, fenced code, HTML
 * comments, and link definitions are dropped, and a link is reduced to its own text so no URL reaches the detector.
 * Inline code keeps its content, whose tokens read as opaque nouns and so preserve the adjacency a repair turns on.
 */
function extractMarkdownProse(file: string, content: string): ProseSpan[] {
  const lines = content.split('\n');
  const spans: ProseSpan[] = [];

  let index = skipFrontmatter(lines);
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
 * Extracts comments and multi-word string literals from TypeScript or JavaScript. The literals are what reach a
 * reader as help text, error messages, and test titles; a data literal comes along with them, which is over-inclusion
 * the agent filters. Consecutive `//` lines join into one block so a wrapped sentence survives the scan.
 */
function extractScriptProse(file: string, content: string): ProseSpan[] {
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
      if (countWords(body) >= MIN_LITERAL_WORDS) {
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
function extractShellProse(file: string, content: string): ProseSpan[] {
  const spans: ProseSpan[] = [];
  let block: { line: number; texts: string[] } | undefined;

  function flush(): void {
    if (block !== undefined) spans.push({ file, line: block.line, text: block.texts.join('\n') });
    block = undefined;
  }

  for (const [index, raw] of content.split('\n').entries()) {
    const start = index === 0 && raw.startsWith('#!') ? -1 : findShellCommentStart(raw);
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

/** Returns the index of the newline ending the line `index` sits on, or the content length where none does. */
function findLineEnd(content: string, index: number): number {
  const end = content.indexOf('\n', index);
  return end === -1 ? content.length : end;
}

/** Returns the index of `#` opening a shell comment, or -1 where the line carries none outside a quoted string. */
function findShellCommentStart(line: string): number {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '\\' && quote !== "'") {
      index += 1;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1] ?? ''))) {
      return index;
    }
  }
  return -1;
}

/** Returns the index of the quote closing the literal opened at `start`, or the content length where none does. */
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

/** Reports whether a script carries a line produced by no formatter, which marks it as bundled output. */
function hasMachineWidthLines(content: string): boolean {
  return content.split('\n').some((line) => line.length > MACHINE_LINE_WIDTH);
}

/** Reports whether a line opens a new Markdown block: a heading, a list item, or a blockquote. */
function isBlockStart(line: string): boolean {
  return /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>)/.test(line);
}

/**
 * Reports whether `file` is outside what the sweep may edit: a harness's deployed `skills/` or `scripts/` tree, whose
 * source lives elsewhere, or the artifact tree, whose files record a moment and stay as written.
 */
function isExcludedPath(input: { file: string; root: string; artifactBaseDir: string }): boolean {
  const segments = input.file.split('/');
  for (const config of Object.values(HARNESSES)) {
    const homeIndex = segments.indexOf(config.homeDir);
    if (homeIndex === -1) continue;
    const next = segments[homeIndex + 1];
    if (next === config.skillsDirName || next === config.scriptsDirName) return true;
  }

  const relativeToArtifacts = path.relative(input.artifactBaseDir, path.resolve(input.root, input.file));
  return relativeToArtifacts !== '' && !relativeToArtifacts.startsWith('..') && !path.isAbsolute(relativeToArtifacts);
}

/** Reports whether a file's content marks it as deployed output, whose edit belongs to the source it was copied from. */
function isGeneratedContent(content: string): boolean {
  return GENERATED_MARKERS.some((marker) => marker.test(content));
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

/** Runs one `git ls-files` form under `root`, returning repository-relative paths. */
function listGitFiles(root: string, args: readonly string[], paths: readonly string[]): string[] {
  let stdout: string;
  try {
    stdout = execFileSync('git', [...args, ...paths], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new NotARepositoryError(`${root} is not inside a git working tree; the sweep reads what git tracks`);
  }
  return stdout.split(NUL).filter((file) => file !== '');
}

/**
 * Strips the syntax that a Markdown line carries around its prose: the block marker opening it, and each link's URL. The
 * result holds the line's own newline count, which is zero, so a span's line mapping survives the rewrite.
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

/** Reads a file as UTF-8, returning undefined where it cannot be read or holds a NUL byte, which marks it binary. */
function readFileSafely(absolutePath: string): string | undefined {
  try {
    const content = readFileSync(absolutePath, 'utf8');
    return content.includes(NUL) ? undefined : content;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the artifact base directory the sweep must stay out of, from the same preferences the session-context
 * deriver reads. A preferences file that cannot be read falls back to the documented default rather than failing the
 * sweep, since the exclusion binds only where a repository keeps its artifacts in tree.
 */
async function resolveSweepArtifactBaseDir(root: string, home: string): Promise<string> {
  try {
    const { preferences } = await readPreferences({ cwd: root, home });
    return resolveArtifactBaseDir(preferences.artifacts?.base_dir ?? DEFAULT_ARTIFACT_BASE_DIR, root, home);
  } catch {
    return resolveArtifactBaseDir(DEFAULT_ARTIFACT_BASE_DIR, root, home);
  }
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

/** Returns the index of the first line past a YAML frontmatter block, or 0 where the file opens with none. */
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

/** Splits a Markdown table row into its cells, so one cell's prose never runs into the next. */
function splitTableCells(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|');
}

/** Strips a comment's own punctuation: the `//` already removed, plus a block comment's leading `*` per line. */
function stripCommentMarkers(text: string): string {
  return text.replace(/^\s*\*+\s?/, '').trim();
}

// endregion | Helpers
