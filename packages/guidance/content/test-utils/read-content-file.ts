import { existsSync } from 'node:fs';
import path from 'node:path';

import { type ArtifactType, HARNESS_IDS, type HarnessId, readArtifact } from 'codeassembly/api';

import { CONTENT_ROOT } from './content-root.ts';
import { renderLibrary } from './rendered-library.ts';

/**
 * Reads a library file by its path under the content root, as the pipeline delivers it: An artifact's source with its
 * includes expanded, and any other file (a support entry, a skill's secondary file, a harness guidance file) as the
 * harness home receives it. A file that is not harness-specific is read from the Claude render.
 */
export async function readContentFile(relativePath: string): Promise<string> {
  const artifact = identifyArtifact(relativePath);
  if (artifact !== undefined) {
    return (await readArtifact(CONTENT_ROOT, artifact.type, artifact.slug)).content;
  }

  const [harness, deployedPath] = locateDeployedFile(relativePath);
  const entry = (await renderLibrary(harness))[deployedPath];
  if (entry === undefined) {
    throw new Error(`The ${harness} render of the library does not contain ${deployedPath} (from ${relativePath})`);
  }
  return entry.content;
}

// region | Helpers

/** Membership set for `isHarnessId`, widened to `string` so that an arbitrary value tests without an assertion. */
const HARNESS_ID_SET: ReadonlySet<string> = new Set(HARNESS_IDS);

/** Returns the artifact whose frontmatter file `relativePath` names, or `undefined` for any other file. */
function identifyArtifact(relativePath: string): { type: ArtifactType; slug: string } | undefined {
  const patterns: ReadonlyArray<[ArtifactType, RegExp]> = [
    ['collection', /^collections\/([^/]+)\.md$/],
    ['rulebook', /^guidance\/rulebooks\/([^/]+)\.md$/],
    ['skill', /^skills\/([^/_.][^/]*)\/SKILL\.md$/],
    ['subagent', /^subagents\/([^/]+)\.md$/],
  ];
  for (const [type, pattern] of patterns) {
    const slug = pattern.exec(relativePath)?.[1];
    if (slug !== undefined) {
      return { type, slug };
    }
  }
  return undefined;
}

/** True when `value` names a supported harness. */
function isHarnessId(value: string): value is HarnessId {
  return HARNESS_ID_SET.has(value);
}

/**
 * Maps a non-artifact content path to the harness whose render contains it and its path in that render. A support
 * entry, anything under `skills/` outside a skill directory, renders into the content root's support namespace.
 */
function locateDeployedFile(relativePath: string): [HarnessId, string] {
  const match = /^guidance\/_harnesses\/([^/]+)\/(.+)$/.exec(relativePath);
  const harness = match?.[1];
  const fileName = match?.[2];
  if (harness !== undefined && fileName !== undefined && isHarnessId(harness)) {
    return [harness, fileName];
  }
  const entry = /^skills\/([^/]+)/.exec(relativePath)?.[1];
  if (entry !== undefined && !existsSync(path.join(CONTENT_ROOT, 'skills', entry, 'SKILL.md'))) {
    return ['claude', `skills/_sources/${path.basename(CONTENT_ROOT)}/${relativePath.slice('skills/'.length)}`];
  }
  return ['claude', relativePath];
}

// endregion | Helpers
