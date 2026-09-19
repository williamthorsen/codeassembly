import { readFile, stat } from 'node:fs/promises';

import { parse as parseYaml } from 'yaml';

import type { DeployedPath, DeployedPathSet } from '../commands/sync/collect-deployed-paths.ts';
import { extractAmbientRegionContent } from '../lib/ambient-region.ts';
import { parseFrontmatter } from '../lib/frontmatter-merger.ts';
import { readFileOrEmpty } from '../lib/fs-helpers.ts';
import { isRecord } from '../lib/type-guards.ts';
import type { DeployedDocument, SizeAggregates } from './types.ts';

/** One deployment's measured size vector: every file's bytes, and the three totals derived from them. */
export interface DeploymentMeasurement {
  readonly documents: Record<string, DeployedDocument>;
  readonly aggregates: SizeAggregates;
}

/**
 * Measures every collected file and derives the three aggregates.
 *
 * The always-loaded aggregate and the on-invocation total overlap rather than partition: A description's bytes count
 * in the always-loaded total and again inside its document's bytes, because a session pays for the description in the
 * harness's listing and pays for it a second time when the body loads. Whatever presents these totals must not imply
 * that they sum to a whole.
 */
export async function measureDeployment(set: DeployedPathSet): Promise<DeploymentMeasurement> {
  const documents: Record<string, DeployedDocument> = {};
  let onInvocation = 0;
  let assets = 0;
  let skillDescriptions = 0;
  let subagentDescriptions = 0;

  for (const file of set.files) {
    const { size } = await stat(file.absPath);
    documents[file.key] = { bytes: size, kind: file.kind };
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
    documents,
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
  const { lines } = parseFrontmatter(await readFile(file.absPath, 'utf8'));
  let parsed: unknown;
  try {
    parsed = parseYaml(lines.join('\n'));
  } catch {
    return 0;
  }
  return isRecord(parsed) && typeof parsed.description === 'string' ? byteLength(parsed.description) : 0;
}

// endregion | Helpers
