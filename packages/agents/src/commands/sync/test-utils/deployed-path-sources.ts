import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getManifestPath, writeManifest } from '../../../lib/manifest.ts';
import type { AgentsManifest, ManifestEntry } from '../../../lib/types.ts';
import type { DeployedPathSources, ResolveSourceRoot } from '../collect-deployed-paths.ts';
import type { SyncDomain } from '../sync-domain.ts';

/** Plan sources naming one harness's skills dir, the declared skills deployed into it, and the rulebook skills. */
export function buildSources(input: {
  skillsDir: string;
  skillSlugs?: ReadonlyArray<string>;
  rulebookSkillNames?: ReadonlyArray<string>;
  source?: string;
}): DeployedPathSources {
  const source = input.source ?? DEFAULT_SOURCE;
  return {
    ambientHosts: [],
    harnessSkillTargets: [{ harnessId: 'claude', skillsDir: input.skillsDir }],
    harnessSubagentTargets: [],
    resolved: (input.rulebookSkillNames ?? []).map((skillName) => ({
      skill: true,
      skillName,
      source,
      srcPath: path.join(contentRootOf(source), 'guidance', 'rulebooks', `${skillName}.md`),
      contentRoot: contentRootOf(source),
    })),
    resolvedSkills: (input.skillSlugs ?? []).map((slug) => ({
      slug,
      srcDir: path.join(contentRootOf(source), 'skills', slug),
      contentRoot: contentRootOf(source),
      source,
    })),
    resolvedSubagents: [],
    sourceSupportPlans: [],
    targets: { harnessIds: ['claude'] },
  };
}

/** The content root from which an artifact of one declared source resolves. */
export function contentRootOf(source: string): string {
  return `/sources/${source}`;
}

/** The source from which an artifact resolves when a test does not name one. */
export const DEFAULT_SOURCE = 'codeassembly';

/** The content root of the default source. */
export const DEFAULT_SOURCE_DIR = '/sources/codeassembly';

/** The home domain, whose base is the home directory that the collection is given. */
export function homeDomain(homeDir: string): SyncDomain {
  return { baseDir: homeDir, ambient: 'harness-home', anchorBase: '~' };
}

/** The repo domain, rooted at the project directory under which the harness trees sit. */
export function projectDomain(projectRoot: string): SyncDomain {
  return { baseDir: projectRoot, ambient: 'project-local', anchorBase: projectRoot };
}

/** Maps each declared source's name to a directory named after it. */
export const resolveSourceRoot: ResolveSourceRoot = (source) => contentRootOf(source);

/** One resolved subagent, naming the authored file and content root from which it rendered. */
export function subagent(
  slug: string,
  source = DEFAULT_SOURCE,
): { slug: string; source: string; srcPath: string; contentRoot: string } {
  return {
    slug,
    source,
    srcPath: path.join(contentRootOf(source), 'subagents', `${slug}.md`),
    contentRoot: contentRootOf(source),
  };
}

/** Writes one deployed file, creating its enclosing directories. */
export async function writeDeployedFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/** Writes an install manifest naming `entries` as deployed into the Claude harness. */
export async function writeInstallManifest(homeDir: string, entries: ReadonlyArray<ManifestEntry>): Promise<void> {
  const manifest: AgentsManifest = {
    schemaVersion: 2,
    harnesses: { claude: { harness: 'claude', version: '0.15.0', installedAt: '2026-09-19T08:00:00.000Z', entries } },
  };
  await writeManifest(getManifestPath(homeDir), manifest);
}
