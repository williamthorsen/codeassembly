/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
/**
 * CLI entry for the session-context deriver.
 *
 * - Resolves the current branch (via `git branch --show-current`, or the `--branch` flag for tests).
 * - Reads project + global preferences via `read-preferences.ts`.
 * - Idempotent: if a current-schema manifest already exists at the canonical path, reads and returns
 *   it. Otherwise composes a fresh manifest, writes it, and returns it. Stale-schema or corrupt
 *   manifests are overwritten in place.
 * - Writes JSON to stdout, diagnostics to stderr. Exit 0 on success; exit 1 on hard failures
 *   (detached HEAD, no git, schema-validation error).
 *
 * Flags:
 *   --branch <name>   Override branch lookup (used by tests and the smoke harness).
 *   --cwd <path>      Override working directory (used by tests).
 *   --home <path>     Override home directory for `~/.agents/preferences.yaml` lookup.
 *                     Defaults to `os.homedir()`.
 */
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { composeManifest } from './compose-manifest.ts';
import { readPreferences } from './read-preferences.ts';
import type { BranchManifest } from './types.ts';

const execFileAsync = promisify(execFile);

/** Required-field set used to detect stale manifests written under an older schema. */
const REQUIRED_MANIFEST_FIELDS: readonly string[] = [
  'ticket_id',
  'ticket_ref',
  'project_slug',
  'platform',
  'default_branch',
  'branch_name',
  'artifact_base_dir',
  'artifact_paths',
  'created_at',
];

/** Parsed CLI args. */
interface ParsedArgs {
  readonly branch: string | null;
  readonly cwd: string | null;
  readonly home: string | null;
}

/** Top-level runner: parses args, derives the manifest, writes JSON to stdout. */
async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const cwd = parsed.cwd ?? process.cwd();
    const branch = parsed.branch ?? (await resolveCurrentBranch(cwd));

    const manifest = await deriveSessionContext({
      cwd,
      branch,
      now: new Date(),
      ...(parsed.home !== null && { home: parsed.home }),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`derive-session-context: ${message}\n`);
    process.exit(1);
  }
}

/**
 * Idempotent derivation: read an existing current-schema manifest, or compose and write one.
 *
 * @internal Exported for testing.
 */
export async function deriveSessionContext(input: {
  cwd: string;
  branch: string;
  now: Date;
  home?: string;
}): Promise<BranchManifest> {
  if (input.branch === '' || input.branch === 'HEAD') {
    throw new Error('Detached HEAD: this script requires an active branch. Create or check out a branch first.');
  }

  const home = input.home ?? homedir();
  const sanitizedBranch = sanitizeBranch(input.branch);
  const newPath = path.join(input.cwd, '.agents', `${sanitizedBranch}.branch-manifest.json`);
  const oldPath = path.join(input.cwd, '.agents', `${sanitizedBranch}.manifest.json`);

  // Fast path: read an existing valid manifest at the canonical (new-format) path.
  const cached = await tryReadManifest(newPath);
  if (cached !== null) {
    return cached;
  }

  // Backward compatibility: read an existing valid manifest at the old path (`.manifest.json`).
  const cachedOld = await tryReadManifest(oldPath);
  if (cachedOld !== null) {
    return cachedOld;
  }

  // Otherwise compose afresh. Either no manifest existed, or the one that did was corrupt or stale.
  const readResult = await readPreferences({ cwd: input.cwd, home });
  const manifest = composeManifest({
    preferences: readResult.preferences,
    branchName: input.branch,
    cwd: input.cwd,
    home,
    now: input.now,
  });

  await mkdir(path.dirname(newPath), { recursive: true });
  await writeFile(newPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return manifest;
}

/**
 * Sanitizes a branch name for filesystem use: replace `/` with `-`, trim trailing `-`.
 * Mirrors the sanitization performed by `resolve-frontmatter.sh` so previously-written manifests
 * remain reachable. Underscores are deliberately preserved (see `_data/branch-format.md`).
 *
 * @internal Exported for testing.
 */
export function sanitizeBranch(branch: string): string {
  let sanitized = branch.trim().replaceAll('/', '-');
  while (sanitized.endsWith('-')) {
    sanitized = sanitized.slice(0, -1);
  }
  return sanitized;
}

/**
 * Reads a manifest file at `filePath`. Returns the parsed manifest when the file exists, parses
 * as JSON, and has every required field. Returns `null` when the file does not exist, fails to
 * parse, or is missing required fields (caller will overwrite).
 */
async function tryReadManifest(filePath: string): Promise<BranchManifest | null> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoentError(error)) {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Corrupt manifest: caller composes afresh.
    return null;
  }
  if (!isCurrentSchema(parsed)) {
    return null;
  }
  return parsed;
}

/** True when `value` is an object containing every required manifest field. */
function isCurrentSchema(value: unknown): value is BranchManifest {
  if (!isRecord(value)) {
    return false;
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in value)) {
      return false;
    }
  }
  return true;
}

/** True when `error` carries the Node `ENOENT` errno. */
function isEnoentError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  return error.code === 'ENOENT';
}

/** Narrows `value` to a plain object with unknown property values. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolves the current branch name via `git -C {cwd} branch --show-current`. */
async function resolveCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'branch', '--show-current']);
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not resolve current branch (is this a git repository?): ${message}`);
  }
}

/**
 * Parses CLI argv. Supports `--branch <name>` and `--cwd <path>`. Throws on unknown flags or
 * missing values.
 *
 * @internal Exported for testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let branch: string | null = null;
  let cwd: string | null = null;
  let home: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    switch (arg) {
      case '--branch':
        branch = consumeValue(argv, i, '--branch');
        i += 1;
        continue;

      case '--cwd':
        cwd = consumeValue(argv, i, '--cwd');
        i += 1;
        continue;

      case '--home':
        home = consumeValue(argv, i, '--home');
        i += 1;
        continue;

      default:
        break;
    }
    if (arg.startsWith('--branch=')) {
      branch = arg.slice('--branch='.length);
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
    } else if (arg.startsWith('--home=')) {
      home = arg.slice('--home='.length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { branch, cwd, home };
}

/** Reads the value following a space-delimited flag at `index`. Throws when missing. */
function consumeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

// Run as a script. Importable for tests because the file uses `isMain()` rather than a top-level
// invocation when imported. Mirrors the kb-add / update-jira-ticket entry-point pattern.
if (isMain()) {
  await main();
}

/** True when this module is the entry point. Resolves both sides through `realpathSync` to tolerate symlinked installs. */
function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    // Fall back to `true` rather than `false`: a broken symlink during entry-point resolution
    // most plausibly means we *are* the entry point (the CLI is being invoked through a stale link).
    // Returning `false` here would silently no-op the CLI; running `main()` defensively at worst
    // runs the script on an unexpected import, which surfaces an error rather than a silent skip.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`derive-session-context: warning: could not determine entry point: ${message}\n`);
    return true;
  }
}
