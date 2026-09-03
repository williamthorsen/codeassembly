import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { getManifestPath } from './manifest.ts';
import { readRunningPackageVersion, resolveRunningPackageRoot } from './running-package.ts';
import { isEnoent, isRecord } from './type-guards.ts';
import type { HomeWriteCommand } from './types.ts';

const execFileAsync = promisify(execFile);

/** Filename of the stamp, written beside the install manifest in `~/.codeassembly/`. */
const PROVENANCE_FILENAME = 'home-provenance.json';

/** How long a commit lookup may take before the stamp is written without one. */
const COMMIT_LOOKUP_TIMEOUT_MS = 5_000;

/** Membership set for `isHomeWrite`, widened to `string` so an arbitrary value tests without a type assertion. */
const HOME_WRITE_COMMANDS: ReadonlySet<string> = new Set<HomeWriteCommand>(['install', 'sync --global']);

/** What the last home-domain command attempted, recorded whether or not it went on to write. */
export interface HomeAttempt {
  readonly command: HomeWriteCommand;
  readonly attemptedAt: string;
  readonly outcome: 'failed' | 'succeeded';
  /** Rendered failure text, so a reader sees what broke without re-running the command. Absent on a success. */
  readonly failureSummary?: string;
  /** How many defects the failure carried, where it carried a list of them. */
  readonly defectCount?: number;
}

/** What a failed home-domain command reports about itself. */
export interface HomeFailure {
  readonly summary: string;
  readonly defectCount?: number;
}

/**
 * The home-domain stamp: what last wrote it, and what was last attempted against it. The two are separate because a
 * failed attempt writes nothing, and a reader that sees only the write cannot tell a current deployment from one an
 * abandoned run left behind.
 *
 * The version-1 write fields are still mirrored at the top level, so a `codeassembly` predating `lastWrite` reads the
 * stamp rather than rejecting it and reporting nothing. Every worktree carries a binary of its own, so a machine
 * mid-upgrade is the normal case rather than an edge one. The mirror is removable once no such binary is in use.
 */
export interface HomeProvenance {
  readonly schemaVersion: number;
  readonly lastWrite?: HomeWrite;
  readonly lastAttempt?: HomeAttempt;
  readonly version?: string;
  readonly sourcePath?: string;
  readonly sourceCommit?: string;
  readonly command?: HomeWriteCommand;
  readonly writtenAt?: string;
}

/** What last wrote the home domain: which build, from where, by which command, and when. */
export interface HomeWrite {
  /** Version of the package whose binary wrote. */
  readonly version: string;
  /** Absolute, symlink-resolved root of that package. */
  readonly sourcePath: string;
  /** Commit the source tree was on, absent where the source is not a git tree (an npm install has none). */
  readonly sourceCommit?: string;
  readonly command: HomeWriteCommand;
  readonly writtenAt: string;
}

/** Resolves the path of the provenance stamp, a sibling of the install manifest. */
export function getHomeProvenancePath(homeDir?: string): string {
  return path.join(path.dirname(getManifestPath(homeDir)), PROVENANCE_FILENAME);
}

/**
 * Reads the provenance stamp, or `undefined` where none can be read — no stamp has been written, or the one on disk
 * is truncated or malformed. A stamp that cannot be read reports nothing, so a damaged file costs `status` one line
 * rather than the whole report.
 */
export async function readHomeProvenance(homeDir?: string): Promise<HomeProvenance | undefined> {
  return readHomeProvenanceAt(getHomeProvenancePath(homeDir));
}

/**
 * Reads the provenance stamp at an explicit path, applying the same validation as {@link readHomeProvenance}. Serves a
 * caller that knows the file's location without deriving it from a home directory.
 */
export async function readHomeProvenanceAt(provenancePath: string): Promise<HomeProvenance | undefined> {
  let raw: string;
  try {
    raw = await readFile(provenancePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return normalizeProvenance(parsed);
}

/**
 * Records a failed home-domain attempt, keeping whatever write the stamp already reports. Swallows its own failure:
 * an error is already on its way to the caller, and losing the record must not replace it with a different one.
 */
export async function recordFailedHomeAttempt(
  command: HomeWriteCommand,
  failure: HomeFailure,
  homeDir?: string,
): Promise<void> {
  try {
    const existing = await readHomeProvenance(homeDir);
    await writeProvenance(
      {
        schemaVersion: 2,
        ...(existing?.lastWrite !== undefined && { lastWrite: existing.lastWrite }),
        lastAttempt: {
          command,
          attemptedAt: new Date().toISOString(),
          outcome: 'failed',
          failureSummary: failure.summary,
          ...(failure.defectCount !== undefined && { defectCount: failure.defectCount }),
        },
      },
      homeDir,
    );
  } catch {
    return;
  }
}

/**
 * Records what wrote the home domain, so a later reader can tell which installation the current state came from, and
 * the attempt that produced it. Called once a command has finished writing, never on a dry run: the stamp reports
 * what wrote, not what tried.
 */
export async function recordHomeProvenance(command: HomeWriteCommand, homeDir?: string): Promise<void> {
  const packageRoot = resolveRunningPackageRoot();
  const sourceCommit = await readSourceCommit(packageRoot);

  const lastWrite: HomeWrite = {
    version: readRunningPackageVersion(),
    sourcePath: await realpath(packageRoot),
    ...(sourceCommit !== undefined && { sourceCommit }),
    command,
    writtenAt: new Date().toISOString(),
  };

  await writeProvenance(
    {
      schemaVersion: 2,
      lastWrite,
      lastAttempt: { command, attemptedAt: lastWrite.writtenAt, outcome: 'succeeded' },
    },
    homeDir,
  );
}

// region | Helpers

/** Type guard for the attempt block read back from disk. */
function isHomeAttempt(value: unknown): value is HomeAttempt {
  return (
    isRecord(value) &&
    typeof value.command === 'string' &&
    HOME_WRITE_COMMANDS.has(value.command) &&
    typeof value.attemptedAt === 'string' &&
    (value.outcome === 'failed' || value.outcome === 'succeeded')
  );
}

/** Type guard for the write block, applied to a nested `lastWrite` and to the version-1 fields alike. */
function isHomeWrite(value: unknown): value is HomeWrite {
  return (
    isRecord(value) &&
    typeof value.version === 'string' &&
    typeof value.sourcePath === 'string' &&
    typeof value.command === 'string' &&
    HOME_WRITE_COMMANDS.has(value.command) &&
    typeof value.writtenAt === 'string'
  );
}

/**
 * Normalizes a parsed stamp into the current shape, or `undefined` where it carries neither a write nor an attempt.
 * A version-1 file has its flat write fields lifted into `lastWrite`, so an existing machine keeps its stamp.
 */
function normalizeProvenance(parsed: unknown): HomeProvenance | undefined {
  if (!isRecord(parsed) || typeof parsed.schemaVersion !== 'number') {
    return undefined;
  }
  const lastWrite = isHomeWrite(parsed.lastWrite)
    ? parsed.lastWrite
    : isHomeWrite(parsed)
      ? liftWrite(parsed)
      : undefined;
  const lastAttempt = isHomeAttempt(parsed.lastAttempt) ? parsed.lastAttempt : undefined;
  if (lastWrite === undefined && lastAttempt === undefined) {
    return undefined;
  }
  return {
    schemaVersion: parsed.schemaVersion,
    ...(lastWrite !== undefined && { lastWrite, ...lastWrite }),
    ...(lastAttempt !== undefined && { lastAttempt }),
  };
}

/** Reads the version-1 write fields off a stamp that carries them at the top level. */
function liftWrite(parsed: HomeWrite): HomeWrite {
  return {
    version: parsed.version,
    sourcePath: parsed.sourcePath,
    ...(parsed.sourceCommit !== undefined && { sourceCommit: parsed.sourceCommit }),
    command: parsed.command,
    writtenAt: parsed.writtenAt,
  };
}

/**
 * Reads the commit `packageRoot` sits on, or `undefined` where the question has no answer — the path is not a git
 * tree, or git is absent. A published install has no commit to report, so the lookup must never fail the write it
 * describes.
 */
async function readSourceCommit(packageRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', packageRoot, 'rev-parse', 'HEAD'], {
      timeout: COMMIT_LOOKUP_TIMEOUT_MS,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Writes the stamp, mirroring the write block's fields at the top level for a reader predating `lastWrite`. */
async function writeProvenance(provenance: HomeProvenance, homeDir?: string): Promise<void> {
  const mirrored: HomeProvenance = { ...provenance, ...provenance.lastWrite };
  const provenancePath = getHomeProvenancePath(homeDir);
  await mkdir(path.dirname(provenancePath), { recursive: true });
  await writeFile(provenancePath, JSON.stringify(mirrored, null, 2) + '\n', 'utf8');
}

// endregion | Helpers
