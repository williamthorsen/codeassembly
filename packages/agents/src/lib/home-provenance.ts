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

/** Membership set for `isHomeProvenance`, widened to `string` so an arbitrary value tests without a type assertion. */
const HOME_WRITE_COMMANDS: ReadonlySet<string> = new Set<HomeWriteCommand>(['install', 'sync --global']);

/** What last wrote the home domain: which build, from where, by which command, and when. */
export interface HomeProvenance {
  readonly schemaVersion: number;
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
  let raw: string;
  try {
    raw = await readFile(getHomeProvenancePath(homeDir), 'utf8');
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
  return isHomeProvenance(parsed) ? parsed : undefined;
}

/**
 * Records what wrote the home domain, so a later reader can tell which installation the current state came from.
 * Called once a command has finished writing, never on a dry run: the stamp reports what wrote, not what tried.
 */
export async function recordHomeProvenance(command: HomeWriteCommand, homeDir?: string): Promise<void> {
  const packageRoot = resolveRunningPackageRoot();
  const sourceCommit = await readSourceCommit(packageRoot);

  const provenance: HomeProvenance = {
    schemaVersion: 1,
    version: readRunningPackageVersion(),
    sourcePath: await realpath(packageRoot),
    ...(sourceCommit !== undefined && { sourceCommit }),
    command,
    writtenAt: new Date().toISOString(),
  };

  const provenancePath = getHomeProvenancePath(homeDir);
  await mkdir(path.dirname(provenancePath), { recursive: true });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n', 'utf8');
}

// region | Helpers

/** Type guard for a stamp read back from disk. */
function isHomeProvenance(value: unknown): value is HomeProvenance {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.schemaVersion === 'number' &&
    typeof value.version === 'string' &&
    typeof value.sourcePath === 'string' &&
    typeof value.command === 'string' &&
    HOME_WRITE_COMMANDS.has(value.command) &&
    typeof value.writtenAt === 'string'
  );
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

// endregion | Helpers
