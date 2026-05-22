import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { AliasMap } from '@codeassembly/kb-core/tags';
import { loadAliases } from '@codeassembly/kb-core/tags';

import type { RawHit, ScopedKb } from './types.ts';

const execFileAsync = promisify(execFile);

/** Number of context lines captured on each side of a ripgrep match for the snippet. */
const SNIPPET_CONTEXT_LINES = 1;

/**
 * Run ripgrep over the note bodies and frontmatter of every in-scope KB and return the raw hits.
 *
 * The query is tokenized on whitespace; each term is also expanded through the KB's `tag-aliases.yaml`
 * so a query term that is a known alias additionally matches notes carrying its canonical tag. Terms are
 * combined disjunctively — a note matching any term is a hit. Each note appears at most once per KB; its
 * snippet is drawn from the first matching line and its immediate neighbors.
 *
 * ripgrep is required on `PATH`; an absent binary throws with a remediation hint.
 */
export async function recallNotes(input: { query: string; scopedKbs: ScopedKb[] }): Promise<RawHit[]> {
  const baseTerms = tokenizeQuery(input.query);
  if (baseTerms.length === 0) {
    return [];
  }

  const hits: RawHit[] = [];
  for (const kb of input.scopedKbs) {
    if (!(await isExistingDirectory(kb.path))) {
      continue;
    }
    const aliases = await loadAliasesForKb(kb.path);
    const terms = expandTerms(baseTerms, aliases);
    const kbHits = await searchKb({ kb, terms });
    hits.push(...kbHits);
  }
  return hits;
}

// region | Helpers

/** Split a query string into lowercase search terms, dropping empties. */
function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/**
 * Expand each base term with its canonical tag form. When a term is a known alias, the canonical tag is
 * added as an extra search term; notes carry canonical tags only, so this lets an alias query match them.
 */
function expandTerms(baseTerms: string[], aliases: AliasMap): string[] {
  const expanded = new Set(baseTerms);
  for (const term of baseTerms) {
    const canonical = aliases.get(term);
    if (canonical !== undefined) {
      expanded.add(canonical.toLowerCase());
    }
  }
  return [...expanded];
}

/** Load a KB's `tag-aliases.yaml`, returning an empty map when the file is absent or unreadable. */
async function loadAliasesForKb(kbPath: string): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: { path: kbPath, kbDir: join(kbPath, '.kb'), via: 'ancestor-walk' } });
  } catch {
    // A malformed alias file degrades to no expansion rather than failing the whole run.
    return new Map();
  }
}

/** Run a single ripgrep invocation across one KB and collect its hits, de-duplicated by note path. */
async function searchKb(input: { kb: ScopedKb; terms: string[] }): Promise<RawHit[]> {
  const pattern = input.terms.map(escapeRegExp).join('|');
  const stdout = await runRipgrep({ pattern, searchDir: input.kb.path });
  const matches = parseRipgrepOutput(stdout);

  const byPath = new Map<string, RawHit>();
  for (const match of matches) {
    if (byPath.has(match.path)) {
      continue;
    }
    byPath.set(match.path, {
      path: match.path,
      kbName: input.kb.name,
      kbPath: input.kb.path,
      snippet: match.snippet,
    });
  }
  return [...byPath.values()];
}

/** Invoke ripgrep over `*.md` files and return its stdout; an empty match set yields an empty string. */
async function runRipgrep(input: { pattern: string; searchDir: string }): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'rg',
      [
        '--ignore-case',
        '--glob',
        '*.md',
        '--glob',
        '!.kb/**',
        '--context',
        String(SNIPPET_CONTEXT_LINES),
        '--heading',
        '--line-number',
        '--color',
        'never',
        input.pattern,
        input.searchDir,
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    // ripgrep exits 1 when no matches are found — that is an empty result, not a failure.
    if (isExitCode(error, 1)) {
      return '';
    }
    if (isMissingBinary(error)) {
      throw new Error('kb-retrieve requires ripgrep (`rg`) on PATH. Install it and retry.');
    }
    throw error;
  }
}

/**
 * Parse ripgrep `--heading` output into one entry per note, with a snippet built from the matching line
 * and its captured context neighbors.
 */
function parseRipgrepOutput(stdout: string): Array<{ path: string; snippet: string }> {
  if (stdout.trim() === '') {
    return [];
  }

  const entries: Array<{ path: string; snippet: string }> = [];
  let currentPath: string | null = null;
  let snippetLines: string[] = [];

  function flush(): void {
    if (currentPath !== null && snippetLines.length > 0) {
      entries.push({ path: currentPath, snippet: snippetLines.join(' ').trim() });
    }
  }

  for (const line of stdout.split('\n')) {
    if (line === '') {
      continue;
    }
    if (line === '--') {
      // ripgrep separates context groups with `--`; the first group is enough for the snippet.
      continue;
    }
    if (!/^\s*\d+[-:]/.test(line)) {
      // A heading line: a file path.
      flush();
      currentPath = line;
      snippetLines = [];
      continue;
    }
    if (snippetLines.length < SNIPPET_CONTEXT_LINES * 2 + 1) {
      snippetLines.push(stripLineNumberPrefix(line));
    }
  }
  flush();
  return entries;
}

/** Drop ripgrep's `<n>:` or `<n>-` line-number prefix from a content line. */
function stripLineNumberPrefix(line: string): string {
  return line.replace(/^\s*\d+[-:]/, '').trim();
}

/** Escape regex metacharacters so query terms are matched literally inside ripgrep's alternation. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Return true when the path exists and is a directory. */
async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/** Return true when the error is a child-process failure with the given exit code. */
function isExitCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Return true when the error indicates the `rg` binary could not be spawned. */
function isMissingBinary(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

// endregion | Helpers
