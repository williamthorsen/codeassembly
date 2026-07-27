import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { directoryExists } from '@codeassembly/kb/filesystem';
import { KB_DIR, resolveKbDir } from '@codeassembly/kb/layout';
import type { AliasMap } from '@codeassembly/kb/tags';
import { loadAliases } from '@codeassembly/kb/tags';

import { isErrorCode, isRecord } from '../lib/type-guards.ts';
import type { RawHit, ScopedKb } from './types.ts';

const execFileAsync = promisify(execFile);

/**
 * Runs a process and resolves its captured stdout, rejecting with an error carrying `code` on a non-zero exit or a
 * failed spawn. The only path by which recall reaches ripgrep, so a caller can substitute one and spawn nothing.
 */
export type ProcessRunner = (command: string, args: readonly string[]) => Promise<{ stdout: string }>;

/** Recalls notes for a query across the in-scope KBs. The seam `searchNotes` injects, so a caller can substitute one. */
export type RecallFn = (input: { query: string; scopedKbs: ScopedKb[] }) => Promise<RecallResult>;

/** Output cap for one ripgrep invocation, sized well past the match set of a large vault. */
const RIPGREP_MAX_BUFFER = 32 * 1024 * 1024;

/** Number of context lines captured on each side of a ripgrep match for the snippet. */
const SNIPPET_CONTEXT_LINES = 1;

/** The recall outcome: the raw hits plus the in-scope KBs that were skipped because their path did not exist. */
export interface RecallResult {
  /** The raw ripgrep hits across every searched KB. */
  hits: RawHit[];
  /** In-scope KBs skipped because their path was absent (`ENOENT` / `ENOTDIR`) on disk. */
  missingKbs: ScopedKb[];
}

/**
 * Runs ripgrep over the note bodies and frontmatter of every in-scope KB and return the raw hits.
 *
 * The query is tokenized on whitespace; each term is also expanded through the KB's `tag-aliases.yaml` so that a query
 * term that is a known alias additionally matches notes carrying its canonical tag. Terms are combined disjunctively:
 * A note matching any term is a hit. Each note appears at most once per KB; its snippet is drawn from the first
 * matching line and its immediate neighbors.
 *
 * An in-scope KB whose path is absent (`ENOENT` / `ENOTDIR`) is skipped and reported in `missingKbs` so that callers
 * can surface the dead path; a permission error (`EACCES` / `EPERM`) on a path that does exist still throws.
 *
 * ripgrep is required on `PATH`; an absent binary throws with a remediation hint. `runner` overrides how the process is
 * reached, defaulting to a real `rg` invocation.
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

/** Escape regex metacharacters so query terms are matched literally inside ripgrep's alternation. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Expands each base term with its canonical tag form. When a term is a known alias, the canonical tag is added as an
 * extra search term; notes carry canonical tags only, so this lets an alias query match them.
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

/** Returns true when the error is a child-process failure with the given exit code. */
function isExitCode(error: unknown, code: number): boolean {
  return isRecord(error) && error.code === code;
}

/** Returns true when the error indicates the `rg` binary could not be spawned. */
function isMissingBinary(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT');
}

/** Shape of a ripgrep `--json` `match` or `context` event, narrowed to the fields this parser reads. */
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
    // A malformed alias file degrades to no expansion rather than failing the whole run.
    return new Map();
  }
}

/**
 * Extracts the note path and line text from one ripgrep `--json` event line; `null` for any line that is not a `match`
 * or `context` event (`begin`/`end`/`summary` events and unparseable lines are skipped).
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
 * ripgrep `--json` emits one JSON event object per output line (`begin`, `match`, `context`, `end`,
 * `summary`). The `match` and `context` events carry the note path and line text in structured fields,
 * so the path is unambiguous regardless of date-patterned directory or filename segments. Non-event
 * lines and other event types are skipped.
 *
 * Exported for direct unit testing of edge cases (malformed lines, snippet-line cap).
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

/** Invokes ripgrep over `*.md` files and return its stdout; an empty match set yields an empty string. */
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

/** The default {@link ProcessRunner}: spawns the real binary, capping its output at {@link RIPGREP_MAX_BUFFER}. */
async function runRipgrepProcess(command: string, args: readonly string[]): Promise<{ stdout: string }> {
  return execFileAsync(command, [...args], { maxBuffer: RIPGREP_MAX_BUFFER });
}

/** Runs a single ripgrep invocation across one KB and collect its hits, de-duplicated by note path. */
async function searchKb(input: { kb: ScopedKb; terms: string[]; runner: ProcessRunner }): Promise<RawHit[]> {
  const pattern = input.terms.map(escapeRegExp).join('|');
  const stdout = await runRipgrep({ pattern, searchDir: input.kb.path, runner: input.runner });
  const matches = parseRipgrepOutput(stdout);

  // ripgrep exits 1 when nothing matched, which `runRipgrep` maps to an empty string, so output here means it found
  // something. Parsing none of it therefore means the `--json` event shape no longer matches what this module reads.
  if (stdout.trim() !== '' && matches.length === 0) {
    throw new Error(
      `ripgrep reported matches in ${input.kb.path} but none of its output could be parsed; its --json event format may have changed`,
    );
  }

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

/** Splits a query string into lowercase search terms, dropping empties. */
function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

// endregion | Helpers
