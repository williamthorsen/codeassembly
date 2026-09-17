import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { directoryExists } from '@williamthorsen/kb/filesystem';
import { KB_DIR, resolveKbDir } from '@williamthorsen/kb/layout';
import { type AliasMap, loadAliases } from '@williamthorsen/kb/tags';

import { isErrorCode, isRecord } from '../lib/type-guards.ts';
import type { RawHit, ScopedKb } from './types.ts';

const execFileAsync = promisify(execFile);

/**
 * Runs a process and resolves its captured stdout, rejecting with an error that has a `code` on a non-zero exit or a
 * failed spawn. Recall invokes ripgrep only through a `ProcessRunner`, so a caller can substitute one and spawn
 * nothing.
 */
export type ProcessRunner = (command: string, args: readonly string[]) => Promise<{ stdout: string }>;

/** Recalls notes for a query across the in-scope KBs. */
export type RecallFn = (input: { query: string; scopedKbs: ScopedKb[] }) => Promise<RecallResult>;

/** Output cap for one ripgrep invocation, sized well past the match set of a large vault. */
const RIPGREP_MAX_BUFFER = 32 * 1_024 * 1_024;

/** Number of context lines captured on each side of a ripgrep match for the snippet. */
const SNIPPET_CONTEXT_LINES = 1;

export interface RecallResult {
  /** The raw ripgrep hits across every searched KB. */
  hits: RawHit[];
  /** In-scope KBs skipped because their path was absent (`ENOENT` / `ENOTDIR`) on disk. */
  missingKbs: ScopedKb[];
}

/**
 * Runs ripgrep over the note bodies and frontmatter of every in-scope KB and returns the raw hits.
 *
 * Tokenizes the query on whitespace and expands each term through the KB's `tag-aliases.yaml`, so that a term that is
 * a known alias also matches the notes that have its canonical tag. Combines the terms disjunctively. Reports each
 * note at most once per KB, with a snippet drawn from the first matching line and its immediate neighbors.
 *
 * Skips an in-scope KB whose path is absent, reporting it in `missingKbs`; still throws a permission error on a path
 * that does exist.
 *
 * Requires ripgrep on `PATH`; throws with a remediation hint when the binary is absent. `runner` replaces the real
 * `rg` invocation.
 */
export async function recallNotes(input: {
  query: string;
  scopedKbs: ScopedKb[];
  runner?: ProcessRunner;
}): Promise<RecallResult> {
  const baseTerms = tokenizeQuery(input.query);
  if (baseTerms.length === 0) {
    return { hits: [], missingKbs: [] };
  }

  const runner = input.runner ?? runRipgrepProcess;
  const hits: RawHit[] = [];
  const missingKbs: ScopedKb[] = [];
  for (const kb of input.scopedKbs) {
    if (!(await directoryExists(kb.path, { absentCodes: ['ENOENT', 'ENOTDIR'] }))) {
      missingKbs.push(kb);
      continue;
    }
    const aliases = await loadAliasesForKb(kb.path);
    const terms = expandTerms(baseTerms, aliases);
    const kbHits = await searchKb({ kb, terms, runner });
    hits.push(...kbHits);
  }
  return { hits, missingKbs };
}

// region | Helpers

/** Escapes regex metacharacters, so that ripgrep matches each query term literally inside its alternation. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Adds the canonical tag of every base term that is a known alias. */
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

/** Returns true when the error is a child-process failure with the given exit code. */
function isExitCode(error: unknown, code: number): boolean {
  return isRecord(error) && error.code === code;
}

/** Returns true when the error indicates the `rg` binary could not be spawned. */
function isMissingBinary(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT');
}

/** Shape of a ripgrep `--json` `match` or `context` event, narrowed to the fields that this parser reads. */
interface RipgrepLineEvent {
  data: { path: { text: string }; lines: { text: string } };
}

/** Returns true when the parsed value is a ripgrep `match` or `context` event with the expected fields. */
function isRipgrepLineEvent(value: unknown): value is RipgrepLineEvent {
  if (!isRecord(value) || !('type' in value)) {
    return false;
  }
  if (value.type !== 'match' && value.type !== 'context') {
    return false;
  }
  if (!isRecord(value.data)) {
    return false;
  }
  const { data } = value;
  return (
    isRecord(data.path) &&
    typeof data.path.text === 'string' &&
    isRecord(data.lines) &&
    typeof data.lines.text === 'string'
  );
}

/** Loads a KB's `tag-aliases.yaml`, returning an empty map when the file is absent or unreadable. */
async function loadAliasesForKb(kbPath: string): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: { path: kbPath, kbDir: resolveKbDir(kbPath) } });
  } catch {
    return new Map();
  }
}

/**
 * Extracts the note path and line text from one ripgrep `--json` event line; `null` for any line that is not a `match`
 * or `context` event.
 */
function parseRipgrepEvent(line: string): { path: string; content: string } | null {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRipgrepLineEvent(event)) {
    return null;
  }
  return { path: event.data.path.text, content: event.data.lines.text.replace(/\n$/, '') };
}

/**
 * Parses ripgrep `--json` output into one entry per note, with a snippet built from the matching line and its
 * captured context neighbors.
 *
 * The path comes from the event's structured field, so a date-patterned directory or filename segment cannot be read
 * as a line number.
 *
 * @internal - Exported to allow testing.
 */
export function parseRipgrepOutput(stdout: string): Array<{ path: string; snippet: string }> {
  if (stdout.trim() === '') {
    return [];
  }

  const entries: Array<{ path: string; snippet: string }> = [];
  const byPath = new Map<string, string[]>();

  for (const line of stdout.split('\n')) {
    if (line === '') {
      continue;
    }
    const parsed = parseRipgrepEvent(line);
    if (parsed === null) {
      continue;
    }
    let snippetLines = byPath.get(parsed.path);
    if (snippetLines === undefined) {
      snippetLines = [];
      byPath.set(parsed.path, snippetLines);
      entries.push({ path: parsed.path, snippet: '' });
    }
    if (snippetLines.length < SNIPPET_CONTEXT_LINES * 2 + 1) {
      snippetLines.push(parsed.content);
    }
  }

  return entries.map((entry) => ({
    path: entry.path,
    snippet: (byPath.get(entry.path) ?? []).join(' ').trim(),
  }));
}

/** Invokes ripgrep over `*.md` files and returns its stdout; an empty match set yields an empty string. */
async function runRipgrep(input: { pattern: string; searchDir: string; runner: ProcessRunner }): Promise<string> {
  try {
    const { stdout } = await input.runner('rg', [
      '--ignore-case',
      '--glob',
      '*.md',
      '--glob',
      `!${KB_DIR}/**`,
      '--context',
      String(SNIPPET_CONTEXT_LINES),
      '--json',
      input.pattern,
      input.searchDir,
    ]);
    return stdout;
  } catch (error) {
    // ripgrep exits 1 to report that nothing matched.
    if (isExitCode(error, 1)) {
      return '';
    }
    if (isMissingBinary(error)) {
      throw new Error('kb-retrieve requires ripgrep (`rg`) on PATH. Install it and retry.', { cause: error });
    }
    throw error;
  }
}

/** Spawns the real binary as the default {@link ProcessRunner}, capping its output at {@link RIPGREP_MAX_BUFFER}. */
async function runRipgrepProcess(command: string, args: readonly string[]): Promise<{ stdout: string }> {
  return execFileAsync(command, [...args], { maxBuffer: RIPGREP_MAX_BUFFER });
}

/** Runs a single ripgrep invocation across one KB and attributes each parsed entry to it. */
async function searchKb(input: { kb: ScopedKb; terms: string[]; runner: ProcessRunner }): Promise<RawHit[]> {
  const pattern = input.terms.map(escapeRegExp).join('|');
  const stdout = await runRipgrep({ pattern, searchDir: input.kb.path, runner: input.runner });
  const matches = parseRipgrepOutput(stdout);

  // `runRipgrep` returns an empty string for an empty match set, so output that parses to nothing means the `--json`
  // event shape no longer matches what this module reads.
  if (stdout.trim() !== '' && matches.length === 0) {
    throw new Error(
      `ripgrep reported matches in ${input.kb.path} but none of its output could be parsed; its --json event format may have changed`,
    );
  }

  return matches.map((match) => ({
    path: match.path,
    kbName: input.kb.name,
    kbPath: input.kb.path,
    snippet: match.snippet,
  }));
}

/** Splits a query string into lowercase search terms, dropping empties. */
function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

// endregion | Helpers
