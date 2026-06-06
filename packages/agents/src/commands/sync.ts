import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { resolveContentDir } from '../lib/content-resolver.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { readRulebooksManifest } from '../lib/rulebooks-manifest.ts';
import { extractInstalledSlugs, injectRulebook, removeRulebook } from '../lib/sentinel-inliner.ts';
import { isEnoent } from '../lib/type-guards.ts';
import type { InstallOptions } from '../lib/types.ts';

/** A declared rulebook resolved against the library: its neutral body and whether it delivers ambiently. */
interface ResolvedRulebook {
  readonly slug: string;
  readonly body: string;
  readonly ambient: boolean;
}

/**
 * Resolves the project-scope `.agents/rulebooks.yaml`, materializes each declared rulebook's neutral body to
 * `.agents/rulebooks/<slug>.md`, inlines `ambient` rulebooks into `.agents/PROJECT.md`, and retracts rulebooks
 * that are no longer declared. Installed state is derived from the filesystem, not a manifest, which keeps the
 * command idempotent. An absent `rulebooks.yaml` is a total no-op.
 *
 * @param projectRoot The project whose `.agents/` directory is synced (defaults to the current directory).
 * @param contentDirOverride Override for the rulebook library source (defaults to the package content dir).
 */
export async function syncCommand(
  options: InstallOptions,
  projectRoot: string = process.cwd(),
  contentDirOverride?: string,
): Promise<void> {
  const declared = await readRulebooksManifest(projectRoot);
  if (declared === undefined) {
    console.info('No .agents/rulebooks.yaml found. Nothing to sync.');
    return;
  }

  const librarySrcDir = path.join(contentDirOverride ?? resolveContentDir(), 'guidance', 'rulebooks');
  const neutralDir = path.join(projectRoot, '.agents', 'rulebooks');
  const projectMdPath = path.join(projectRoot, '.agents', 'PROJECT.md');

  // Resolve and validate every declared rulebook before writing anything, so a missing library file or invalid
  // frontmatter fails the whole run rather than leaving a partial sync behind.
  const resolved = await Promise.all(declared.map((slug) => resolveRulebook(slug, librarySrcDir)));

  // Derive what is currently installed from the filesystem: neutral files plus inlined sentinel blocks.
  const existingProjectMd = await readFileOrEmpty(projectMdPath);
  const installed = new Set<string>([
    ...extractInstalledSlugs(existingProjectMd),
    ...(await listNeutralSlugs(neutralDir)),
  ]);
  const declaredSet = new Set(declared);
  const orphans = [...installed].filter((slug) => !declaredSet.has(slug));

  if (options.dryRun) {
    reportDryRun(resolved, orphans);
    return;
  }

  if (resolved.length > 0) {
    await mkdir(neutralDir, { recursive: true });
  }

  // PROJECT.md is read once, mutated in memory across all inject/remove operations, and written once.
  let projectMd = existingProjectMd;
  for (const rulebook of resolved) {
    await writeIfChanged(path.join(neutralDir, `${rulebook.slug}.md`), rulebook.body);
    if (rulebook.ambient) {
      projectMd = injectRulebook(projectMd, rulebook.slug, rulebook.body);
    }
  }

  // `.agents/rulebooks/` is sync-owned, so deleting an undeclared neutral file here is safe, not user data loss.
  for (const slug of orphans) {
    projectMd = removeRulebook(projectMd, slug);
    await rm(path.join(neutralDir, `${slug}.md`), { force: true });
  }

  if (projectMd !== existingProjectMd) {
    await mkdir(path.dirname(projectMdPath), { recursive: true });
    await writeFile(projectMdPath, projectMd, 'utf8');
  }

  console.info(`Synced ${resolved.length} rulebook(s); retracted ${orphans.length}.`);
}

/** Reads a rulebook from the library, validates its frontmatter, and returns its neutral body and delivery. */
async function resolveRulebook(slug: string, librarySrcDir: string): Promise<ResolvedRulebook> {
  const srcPath = path.join(librarySrcDir, `${slug}.md`);
  let content: string;
  try {
    content = await readFile(srcPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      throw new Error(`Declared rulebook "${slug}" was not found in the library at ${srcPath}`);
    }
    throw error;
  }

  const { rulebook, body } = parseRulebookFile(content, `${slug}.md`);
  return { slug, body: `${body.trim()}\n`, ambient: rulebook.delivery.includes('ambient') };
}

/** Reads a file, returning an empty string when it does not exist. */
async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return '';
    }
    throw error;
  }
}

/** Lists the slugs of materialized neutral files, returning an empty list when the directory is absent. */
async function listNeutralSlugs(neutralDir: string): Promise<ReadonlyArray<string>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(neutralDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.endsWith('.md')).map((entry) => entry.slice(0, -'.md'.length));
}

/** Writes `content` to `filePath` only when it differs from the current contents, keeping re-runs diff-free. */
async function writeIfChanged(filePath: string, content: string): Promise<void> {
  if ((await readFileOrEmpty(filePath)) === content) {
    return;
  }
  await writeFile(filePath, content, 'utf8');
}

/** Prints the writes and retractions a real run would perform. */
function reportDryRun(resolved: ReadonlyArray<ResolvedRulebook>, orphans: ReadonlyArray<string>): void {
  console.info('[dry-run] sync would:');
  for (const rulebook of resolved) {
    const inline = rulebook.ambient ? ' (+ inline into PROJECT.md)' : '';
    console.info(`  write .agents/rulebooks/${rulebook.slug}.md${inline}`);
  }
  for (const slug of orphans) {
    console.info(`  retract ${slug} (remove neutral file and PROJECT.md block)`);
  }
}
