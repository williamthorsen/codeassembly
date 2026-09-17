/* eslint n/no-process-exit: off -- CLI entry point: The helper's resolved exit code must reach the OS, and `main` runs only behind the `isMain()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for the session-context deriver.
 *
 * The CLI writes every diagnostic to stderr, so stdout contains the JSON manifest alone. When the derivation throws an
 * error, the CLI exits 1.
 *
 * - Default-branch invariant: A manifest whose branch is the default branch has no `ticket_url`
 *   and no `pr_url`. Because the default branch is derived from no ticket and belongs to no pull request,
 *   a stored URL there is wrong rather than stale. See `enforceDefaultBranchInvariant`. Only this invariant
 *   causes a write on a no-mutation cache hit: An already-stored value is cleared, once.
 */
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { resolveCurrentBranch, sanitizeBranch } from '../shared/branch-helpers.ts';
import { resolveProjectRoot } from '../shared/resolve-project-root.ts';
import { composeManifest, DEFAULT_REMOTE_NAME } from './compose-manifest.ts';
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

/** The manifest fields written by the mutation flags, and the ones that the default-branch invariant governs. */
const STORED_URL_FIELDS = ['ticket_url', 'pr_url'] as const;

type StoredUrlField = (typeof STORED_URL_FIELDS)[number];

/** A request to set or clear one stored URL field. */
interface ManifestMutation {
  readonly field: StoredUrlField;
  readonly value: string | null;
}

interface ParsedArgs {
  readonly branch: string | null;
  readonly cwd: string | null;
  readonly home: string | null;
  readonly mutations: readonly ManifestMutation[];
}

/** Executes the deriver from `process.argv`, writing the JSON manifest to stdout. */
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
    const message = describeError(error);
    process.stderr.write(`derive-session-context: ${message}\n`);
    process.exit(1);
  }
}

/**
 * Derives the manifest for `branch` idempotently, applying any mutations to the manifest that the read-or-compose path
 * produced. The default-branch invariant is enforced last, over whatever the earlier steps produced.
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

  const mutated = mutations.length === 0 ? base.manifest : applyMutations(base.manifest, mutations);
  const final = enforceDefaultBranchInvariant(mutated, mutations);

  // For a refused mutation, the result is a new object containing the values already stored, so comparing object
  // identity would report a change that did not happen.
  if (base.needsWrite || !hasSameStoredUrls(base.manifest, final)) {
    await writeManifest(newPath, final);
  }
  return final;
}

/** Reads the manifest at `filePath`, or returns `null` when there is no current-schema manifest to read. */
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
    // Warn so that an operator can distinguish a normal cache miss from a file that keeps becoming corrupt.
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
 * Enforces the default-branch invariant: On the default branch, `ticket_url` and `pr_url` are null.
 * That branch is derived from no ticket and belongs to no pull request, so a value there is not the
 * branch's association but whichever one the last session happened to resolve, and a later session
 * auto-resolving from it would proceed against an arbitrary ticket or PR.
 *
 * A field with no value is left exactly as found, absent or null alike. Both a refused `--set-*` and the repair of
 * a value already stored are reported, since a silently vanishing URL is the harder of the two to explain.
 */
function enforceDefaultBranchInvariant(
  manifest: BranchManifest,
  mutations: readonly ManifestMutation[],
): BranchManifest {
  if (!isOnDefaultBranch(manifest)) {
    return manifest;
  }
  let result = manifest;
  for (const field of STORED_URL_FIELDS) {
    const stored = result[field];
    if (stored === undefined || stored === null) {
      continue;
    }
    const refused = mutations.some((mutation) => mutation.field === field && mutation.value !== null);
    process.stderr.write(
      refused
        ? `derive-session-context: refusing to store ${field} on default branch ${manifest.branch_name}\n`
        : `derive-session-context: cleared ${field} stored on default branch ${manifest.branch_name}\n`,
    );
    result = { ...result, [field]: null };
  }
  return result;
}

/**
 * True when the manifest's branch is the repository's default branch. `default_branch` is
 * remote-qualified (`origin/main`) whereas `branch_name` is bare, so the remote is stripped before the
 * comparison. Only the first segment is stripped: A remote name contains no slash, and a branch name may
 * contain one (`origin/release/2.x` yields `release/2.x`).
 */
function isOnDefaultBranch(manifest: BranchManifest): boolean {
  const { default_branch: defaultBranch, branch_name: branchName } = manifest;
  const separatorIndex = defaultBranch.indexOf('/');
  const defaultBranchName = separatorIndex === -1 ? defaultBranch : defaultBranch.slice(separatorIndex + 1);
  return defaultBranchName === branchName;
}

/** True when both manifests have the same value in every stored-URL field. */
function hasSameStoredUrls(a: BranchManifest, b: BranchManifest): boolean {
  return STORED_URL_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Overlays previously stored `ticket_url`/`pr_url` from the prior on-disk manifest onto a freshly composed one. The
 * prior file is read at the raw-JSON level, so it still yields its stored URLs when a change to the
 * required-field set has made it stale.
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
    // Warn so that an operator can explain a vanished `ticket_url` or `pr_url`.
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
 * Result of obtaining the manifest before any mutation: the manifest itself and whether the read-or-compose path that
 * produced it requires a write to disk.
 */
interface BaseManifestResult {
  readonly manifest: BranchManifest;
  readonly needsWrite: boolean;
}

/**
 * Obtains the base manifest by cascade: a fast-path read of the canonical file, an old-format read with migration,
 * then a fresh compose.
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
  // Resolve the git remote only on this path, so that a cache hit runs no git command.
  const remoteName = readResult.preferences.repository?.default_remote?.name ?? DEFAULT_REMOTE_NAME;
  const remoteUrl = await resolveRemoteUrl(input.cwd, remoteName);
  const composed = composeManifest({
    preferences: readResult.preferences,
    branchName: input.branch,
    cwd: input.cwd,
    home: input.home,
    now: input.now,
    remoteUrl,
  });
  const carried = await carryForwardStoredUrls(composed, input.newPath);
  return { manifest: carried, needsWrite: true };
}

/**
 * Writes `manifest` to `targetPath` atomically: serializes to a sibling temp file, then renames it over the target
 * with `rename()` so that a concurrent reader never observes a half-written file. The temp file shares
 * the target's directory so that the rename stays within one filesystem.
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
 * True when `value` is an object containing every required manifest field with the right type. A field dereferenced by
 * a consumer belongs in the checks below, so that a corrupt value makes the deriver recompose the manifest instead of
 * making the consumer throw.
 */
function isCurrentSchema(value: unknown): value is BranchManifest {
  if (!isRecord(value)) {
    return false;
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!Object.hasOwn(value, field)) {
      return false;
    }
  }
  if (!isStringOrNull(value.ticket_id) || !isStringOrNull(value.ticket_ref)) {
    return false;
  }
  if (!isRecord(value.artifact_paths)) {
    return false;
  }
  if (value.scm !== 'github' && value.scm !== 'bitbucket') {
    return false;
  }
  if (typeof value.default_branch !== 'string' || typeof value.branch_name !== 'string') {
    return false;
  }
  if ('ticket_url' in value && !isStringOrNull(value.ticket_url)) {
    return false;
  }
  if ('ticket_base_url' in value && !isStringOrNull(value.ticket_base_url)) {
    return false;
  }
  if ('pr_url' in value && !isStringOrNull(value.pr_url)) {
    return false;
  }
  return true;
}

/** True when `value` is a string or `null`. */
function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/**
 * Resolves the named git remote's fetch URL at `cwd` as git reports it, or null on any failure, which lets a caller
 * treat an unresolvable remote as absent.
 */
async function resolveRemoteUrl(cwd: string, remoteName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', remoteName]);
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Parses the CLI's argv, throwing on an unknown flag or a missing value.
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
    // A resolution failure most plausibly means this module is the entry point, invoked through a stale link, and
    // returning `false` would silently no-op the CLI.
    const message = describeError(error);
    process.stderr.write(`derive-session-context: warning: could not determine entry point: ${message}\n`);
    return true;
  }
}
