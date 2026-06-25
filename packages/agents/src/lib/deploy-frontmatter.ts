import { parse as parseYaml } from 'yaml';

import { parseFrontmatter } from './frontmatter-merger.ts';
import { isRecord } from './type-guards.ts';

/** How an artifact is delivered: `install` via the unconditional install path, `declared` via per-project `sync`. */
export type ArtifactDeploy = 'install' | 'declared';

/**
 * Reads an artifact's `deploy` field from its Markdown frontmatter — the single signal deciding whether the artifact
 * drops off `install` and becomes eligible for declared `sync` delivery. Shared by skills and subagents alike. Absent
 * frontmatter, an absent field, or a null value all resolve to the fail-safe `install` default, so every legacy
 * artifact keeps installing untouched. An unrecognized value throws a clear error naming `sourceLabel` when provided.
 */
export function readDeploy(content: string, sourceLabel?: string): ArtifactDeploy {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed) || parsed.deploy === undefined || parsed.deploy === null) {
    return 'install';
  }

  const value = parsed.deploy;
  if (value === 'install' || value === 'declared') {
    return value;
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  throw new Error(
    `Artifact${where} has an invalid "deploy" value ${JSON.stringify(value)}; expected "install" or "declared".`,
  );
}
