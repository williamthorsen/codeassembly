import { stat } from 'node:fs/promises';

import { parse as parseYaml } from 'yaml';

import type { DeployedPath, DeployedPathSet } from '../commands/sync/collect-deployed-paths.ts';
import { extractAmbientRegionContent } from '../lib/ambient-region.ts';
import { parseFrontmatter } from '../lib/frontmatter-merger.ts';
import { readFileOrEmpty } from '../lib/fs-helpers.ts';
import { isMissingFile, isRecord } from '../lib/type-guards.ts';
import type { DeployedFile, SizeAggregates } from './types.ts';

/** One deployment's measured size vector: every file's bytes, and the three totals derived from them. */
export interface DeploymentMeasurement {
  readonly files: Record<string, DeployedFile>;
  readonly aggregates: SizeAggregates;
}

/**
 * Measures every collected file and derives the three aggregates.
 *
 * The always-loaded aggregate and the on-invocation total overlap rather than partition: A description's bytes count
 * in the always-loaded total and again inside its document's bytes, because a session pays for the description in the
 * harness's listing and pays for it a second time when the body loads. Whatever presents these totals must not imply
 * that they sum to a whole.
 *
 * A collected file that is no longer on disk costs its own row rather than the whole measurement, which keeps one
 * file removed between the deployment and the measurement from dropping the snapshot.
 */
export async function measureDeployment(set: DeployedPathSet): Promise<DeploymentMeasurement> {
  const files: Record<string, DeployedFile> = {};
  let onInvocation = 0;
  let assets = 0;
  let skillDescriptions = 0;
  let subagentDescriptions = 0;

  for (const file of set.files) {
    const size = await readFileSize(file.absPath);
    if (size === undefined) {
      continue;
    }
    files[file.key] = { bytes: size, kind: file.kind };
    if (file.kind === 'document') {
      onInvocation += size;
    } else {
      assets += size;
    }
    if (file.role === 'other') {
      continue;
    }
    const described = await measureDescription(file);
    if (file.role === 'skill') {
      skillDescriptions += described;
    } else {
      subagentDescriptions += described;
    }
  }

  let ambientRegions = 0;
  for (const hostPath of set.ambientHostPaths) {
    ambientRegions += byteLength(extractAmbientRegionContent(await readFileOrEmpty(hostPath)) ?? '');
  }

  return {
    files,
    aggregates: {
      alwaysLoaded: {
        total: ambientRegions + skillDescriptions + subagentDescriptions,
        ambientRegions,
        skillDescriptions,
        subagentDescriptions,
      },
      onInvocation,
      assets,
    },
  };
}

// region | Helpers

/** Counts a string's bytes as UTF-8, which is what a harness reads and what a file's size reports. */
function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * Reads the bytes of one deployed skill's or subagent's `description`, which a harness lists for every session
 * whether or not anything invokes the artifact. A file whose frontmatter declares none contributes nothing.
 *
 * One parser serves both harnesses: A harness overlay replaces the frontmatter keys that it names and leaves every
 * other line of the source's frontmatter in place, so `description` survives the transform unmoved.
 */
async function measureDescription(file: DeployedPath): Promise<number> {
  const { lines } = parseFrontmatter(await readFileOrEmpty(file.absPath));
  let parsed: unknown;
  try {
    parsed = parseYaml(lines.join('\n'));
  } catch {
    return 0;
  }
  return isRecord(parsed) && typeof parsed.description === 'string' ? byteLength(parsed.description) : 0;
}

/** Reads one file's size, or `undefined` when it is no longer on disk. */
async function readFileSize(absPath: string): Promise<number | undefined> {
  try {
    return (await stat(absPath)).size;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers
