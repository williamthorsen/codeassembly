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
 * - Single mutation point: the `--set-*` / `--clear-*` flags read-or-compose a manifest, apply the
 *   mutation, write the file atomically, and emit the updated JSON. With no mutation flag the
 *   read-or-compose behavior is unchanged.
 * - Writes JSON to stdout, diagnostics to stderr. Exit 0 on success; exit 1 on hard failures
 *   (detached HEAD, no git, schema-validation error).
 *
 * Flags:
 *   --branch <name>      Override branch lookup (used by tests and the smoke harness).
 *   --cwd <path>         Caller-supplied base directory for repo-relative paths (`.agents/`). When omitted, the base
 *                        resolves to the git repo root (worktree-aware), falling back to the current working directory.
 *                        Callers that already hold the root (e.g. `resolve-frontmatter.sh`) pass it explicitly; tests
 *                        use it for isolation. See `resolveProjectRoot` for the full precedence.
 *   --home <path>        Override home directory for `~/.agents/preferences.yaml` lookup.
 *                        Defaults to `os.homedir()`.
 *   --set-ticket-url <url>  Store `url` as the manifest's `ticket_url` (write-through overwrite).
 *   --set-pr-url <url>      Store `url` as the manifest's `pr_url` (write-through overwrite).
 *   --clear-ticket-url      Reset the manifest's `ticket_url` to `null`.
 *   --clear-pr-url          Reset the manifest's `pr_url` to `null`.
 */
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { resolveProjectRoot } from '../shared/resolve-project-root.ts';
import { composeManifest } from './compose-manifest.ts';
import { readPreferences } from './read-preferences.ts';
import type { BranchManifest } from './types.ts';

const execFileAsync = promisify(execFile);

/** Required-field set used to detect stale manifests written under an older schema. */
const REQUIRED_MANIFEST_FIELDS: readonly string[] = [
  'ticket_id',
  'ticket_ref',
  'project_slug',
  'scm',
  'default_branch',
  'branch_name',
  'artifact_base_dir',
  'artifact_paths',
  'created_at',
];

/**
 * A request to set or clear one stored URL field. `value` is the new value: a string for a
 * `--set-*` flag, `null` for a `--clear-*` flag.
 */
interface ManifestMutation {
  readonly field: 'ticket_url' | 'pr_url';
  readonly value: string | null;
}

/** Parsed CLI args. `mutations` is empty when no `--set-*`/`--clear-*` flag was supplied. */
interface ParsedArgs {
  readonly branch: string | null;
  readonly cwd: string | null;
  readonly home: string | null;
  readonly mutations: readonly ManifestMutation[];
}

/** Top-level runner: parses args, derives the manifest, writes JSON to stdout. */
async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const cwd = resolveProjectRoot({ cwd: parsed.cwd });
    const branch = parsed.branch ?? (await resolveCurrentBranch(cwd));

    const manifest = await deriveSessionContext({
      cwd,
      branch,
      now: new Date(),
      mutations: parsed.mutations,
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
 * Idempotent derivation with an optional mutation point. With no `mutations`, reads an existing
 * current-schema manifest or composes and writes a fresh one. With `mutations`, obtains the base
 * manifest the same way, applies the set/clear operations, and writes the result atomically. A
 * fresh compose carries previously stored URLs forward from any prior file so a required-field
 * bump never silently drops them.
 *
 * @internal Exported for testing.
 */
export async function deriveSessionContext(input: {
  cwd: string;
  branch: string;
  now: Date;
  home?: string;
  mutations?: readonly ManifestMutation[];
}): Promise<BranchManifest> {
  if (input.branch === '' || input.branch === 'HEAD') {
    throw new Error('Detached HEAD: this script requires an active branch. Create or check out a branch first.');
  }

  const home = input.home ?? homedir();
  const sanitizedBranch = sanitizeBranch(input.branch);
  const newPath = path.join(input.cwd, '.agents', `${sanitizedBranch}.branch-manifest.json`);
  const oldPath = path.join(input.cwd, '.agents', `${sanitizedBranch}.manifest.json`);
  const mutations = input.mutations ?? [];

  const base = await resolveBaseManifest({
    cwd: input.cwd,
    home,
    branch: input.branch,
    now: input.now,
    newPath,
    oldPath,
  });

  if (mutations.length === 0) {
    // Read-or-compose with no mutation: preserve the existing idempotency contract. The fast-path
    // read returns without rewriting; the old-format and fresh-compose paths write.
    if (base.needsWrite) {
      await writeManifest(newPath, base.manifest);
    }
    return base.manifest;
  }

  const mutated = applyMutations(base.manifest, mutations);
  await writeManifest(newPath, mutated);
  return mutated;
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
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Corrupt manifest: caller composes afresh. Surface a one-line diagnostic so an operator
    // can distinguish a normal cache miss (ENOENT) from a recurring storage problem (every call
    // recomposes because the cached file keeps becoming corrupt).
    process.stderr.write(`derive-session-context: warning: manifest at ${filePath} is corrupt; recomposing\n`);
    return null;
  }
  if (!isCurrentSchema(parsed)) {
    return null;
  }
  return parsed;
}

/** Returns a copy of `manifest` with each mutation applied in order. */
function applyMutations(manifest: BranchManifest, mutations: readonly ManifestMutation[]): BranchManifest {
  let result = manifest;
  for (const mutation of mutations) {
    result = { ...result, [mutation.field]: mutation.value };
  }
  return result;
}

/**
 * Overlays previously stored `ticket_url`/`pr_url` from the prior on-disk manifest onto a freshly
 * composed one. The prior file is read best-effort and at the raw-JSON level — deliberately *not*
 * gated on `isCurrentSchema`, because the point of carry-forward is to survive a required-field
 * bump that makes the prior manifest stale. A missing or unparseable file yields no carry-forward,
 * the same outcome as a first compose. Only string values overlay; the composed `null` defaults
 * stand otherwise.
 */
async function carryForwardStoredUrls(composed: BranchManifest, priorPath: string): Promise<BranchManifest> {
  let text: string;
  try {
    text = await readFile(priorPath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return composed;
    }
    throw error;
  }
  let prior: unknown;
  try {
    prior = JSON.parse(text);
  } catch {
    // Best-effort salvage: a corrupt prior file means we cannot carry stored URLs forward, but a
    // fresh compose is still the right outcome. Surface a diagnostic so an operator can explain a
    // vanished `ticket_url`/`pr_url` rather than debugging a silent loss.
    process.stderr.write(
      `derive-session-context: warning: prior manifest at ${priorPath} is corrupt; stored URLs not carried forward\n`,
    );
    return composed;
  }
  if (!isRecord(prior)) {
    return composed;
  }
  return {
    ...composed,
    ...(typeof prior.ticket_url === 'string' && { ticket_url: prior.ticket_url }),
    ...(typeof prior.pr_url === 'string' && { pr_url: prior.pr_url }),
  };
}

/**
 * Result of obtaining the manifest before any mutation: the manifest itself and whether the
 * read-or-compose path that produced it still needs to be written to disk. The fast-path read
 * sets `needsWrite: false`; the old-format migration and the fresh compose set `needsWrite: true`.
 */
interface BaseManifestResult {
  readonly manifest: BranchManifest;
  readonly needsWrite: boolean;
}

/**
 * Obtains the base manifest via the existing read-or-compose cascade: fast-path read of the
 * canonical file, old-format read with migration, then a fresh compose. A fresh compose overlays
 * any previously stored URLs from a prior file so they survive a required-field bump.
 */
async function resolveBaseManifest(input: {
  cwd: string;
  home: string;
  branch: string;
  now: Date;
  newPath: string;
  oldPath: string;
}): Promise<BaseManifestResult> {
  const cached = await tryReadManifest(input.newPath);
  if (cached !== null) {
    return { manifest: cached, needsWrite: false };
  }

  const cachedOld = await tryReadManifest(input.oldPath);
  if (cachedOld !== null) {
    return { manifest: cachedOld, needsWrite: true };
  }

  const readResult = await readPreferences({ cwd: input.cwd, home: input.home });
  const composed = composeManifest({
    preferences: readResult.preferences,
    branchName: input.branch,
    cwd: input.cwd,
    home: input.home,
    now: input.now,
  });
  const carried = await carryForwardStoredUrls(composed, input.newPath);
  return { manifest: carried, needsWrite: true };
}

/**
 * Writes `manifest` to `targetPath` atomically: serialize to a sibling temp file, then `rename()`
 * over the target so a concurrent reader never observes a half-written file. The temp file shares
 * the target's directory so the rename stays within one filesystem.
 */
async function writeManifest(targetPath: string, manifest: BranchManifest): Promise<void> {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/**
 * True when `value` is an object containing every required manifest field with the right type.
 * Hand-rolled type narrowing rather than Zod because the schema is small, stable, and Zod is not
 * in use elsewhere in this module. Fields not checked here (e.g., `project_slug`, `branch_name`)
 * are present-but-unchecked; the downstream consumers tolerate `unknown` for those.
 */
function isCurrentSchema(value: unknown): value is BranchManifest {
  if (!isRecord(value)) {
    return false;
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in value)) {
      return false;
    }
  }
  // Type-narrow the fields most load-bearing for downstream code paths. A hand-edited or
  // corrupt manifest that passed presence checks but failed these is treated as stale and
  // recomposed, matching the "stale-schema overwrite" path.
  if (!isStringOrNull(value.ticket_id) || !isStringOrNull(value.ticket_ref)) {
    return false;
  }
  if (!isRecord(value.artifact_paths)) {
    return false;
  }
  if (value.scm !== 'github' && value.scm !== 'bitbucket') {
    return false;
  }
  // The stored-URL fields are optional and not part of REQUIRED_MANIFEST_FIELDS, so a manifest
  // lacking them stays valid. When present, they must be `string | null`; a wrong-typed value
  // marks the manifest stale and triggers a recompose.
  if ('ticket_url' in value && !isStringOrNull(value.ticket_url)) {
    return false;
  }
  if ('pr_url' in value && !isStringOrNull(value.pr_url)) {
    return false;
  }
  return true;
}

/** True when `value` is a string or `null` (matches the `string | null` union in `BranchManifest`). */
function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
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
  const mutations: ManifestMutation[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--branch') {
      branch = consumeValue(argv, i, '--branch');
      i += 1;
    } else if (arg.startsWith('--branch=')) {
      branch = arg.slice('--branch='.length);
    } else if (arg === '--cwd') {
      cwd = consumeValue(argv, i, '--cwd');
      i += 1;
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
    } else if (arg === '--home') {
      home = consumeValue(argv, i, '--home');
      i += 1;
    } else if (arg.startsWith('--home=')) {
      home = arg.slice('--home='.length);
    } else if (arg === '--set-ticket-url') {
      mutations.push({ field: 'ticket_url', value: consumeValue(argv, i, '--set-ticket-url') });
      i += 1;
    } else if (arg.startsWith('--set-ticket-url=')) {
      mutations.push({ field: 'ticket_url', value: arg.slice('--set-ticket-url='.length) });
    } else if (arg === '--set-pr-url') {
      mutations.push({ field: 'pr_url', value: consumeValue(argv, i, '--set-pr-url') });
      i += 1;
    } else if (arg.startsWith('--set-pr-url=')) {
      mutations.push({ field: 'pr_url', value: arg.slice('--set-pr-url='.length) });
    } else if (arg === '--clear-ticket-url') {
      mutations.push({ field: 'ticket_url', value: null });
    } else if (arg === '--clear-pr-url') {
      mutations.push({ field: 'pr_url', value: null });
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { branch, cwd, home, mutations };
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
// invocation when imported.
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
