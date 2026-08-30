import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { extractAmbientRegionContent, hasAmbientRegion, injectAmbientRegion } from '../lib/ambient-region.ts';
import { assertAnchorsResolve } from '../lib/anchor-resolution.ts';
import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import type { ContentRootRef } from '../lib/content-root-manifest.ts';
import { describeContentRoot, describeMissingSource, resolveDeclaredSources } from '../lib/declared-sources.ts';
import { expandIncludes } from '../lib/directive-expander.ts';
import { emitReport } from '../lib/emit-report.ts';
import { describePruneResult, pruneOrphanedEntries } from '../lib/entry-remover.ts';
import { stripGuidanceHooks } from '../lib/guidance-hooks.ts';
import { HARNESSES, resolveHarnessPaths, resolveSkillsPathPrefix } from '../lib/harness.ts';
import { recordHomeProvenance } from '../lib/home-provenance.ts';
import { assertDesignatedWriter } from '../lib/home-writer-guard.ts';
import { checkSymlinkSafety, copyItem, linkItem, removeItem, unlinkIfSymlink } from '../lib/installer.ts';
import { listSupportEntries } from '../lib/library-catalog.ts';
import { computeContentHash, detectDrift, getManifestPath, readManifest, writeManifest } from '../lib/manifest.ts';
import {
  buildSourceReference,
  buildSourceUrl,
  injectMarkerInFile,
  injectMarkersInDirectory,
} from '../lib/marker-injector.ts';
import { homeAnchor, rewritePathsInFile, type TemplateVariables } from '../lib/path-rewriter.ts';
import type { ReportLine } from '../lib/report-line.ts';
import { readRunningPackageVersion, resolveRunningPackageRoot } from '../lib/running-package.ts';
import { retireSharedGuidance, withoutSharedTier } from '../lib/shared-guidance-retirement.ts';
import { describeHarnessTargeting, resolveTargetHarnesses } from '../lib/target-harnesses.ts';
import { type RenderedSkillEntry, renderSupportEntry } from '../lib/skill-transform.ts';
import { isEnoent } from '../lib/type-guards.ts';
import type {
  AgentsManifest,
  HarnessConfig,
  HarnessId,
  HarnessManifest,
  InstallOptions,
  ManifestEntry,
} from '../lib/types.ts';
import { ensureHarnessHookEntries } from './configure-hooks.ts';

/**
 * The extensions that ship from `content/scripts/` to a harness home: `.sh` shell helpers and `.mjs` TypeScript
 * bundles, either kind invoked by a skill, a subagent, or the harness itself. Anything else there — the README —
 * documents the directory rather than shipping from it.
 */
const SCRIPT_EXTENSIONS: ReadonlyArray<string> = ['.mjs', '.sh'];

/** One content root shipping a harness's guidance template, and the file names it installs from there. */
interface TemplateRoot {
  readonly root: ContentRootRef;
  readonly fileNames: ReadonlyArray<string>;
}

/**
 * Executes the install command, installing skills and subagents for the specified harnesses.
 */
export async function installCommand(
  options: InstallOptions,
  baseDir?: string,
  contentDirOverride?: string,
): Promise<void> {
  // Runs first, and before the dry-run gate: a preview must refuse wherever the real run would.
  await assertDesignatedWriter({
    command: 'install',
    homeDir: baseDir,
    packageRoot: resolveRunningPackageRoot(),
    shouldOverrideWriter: options.shouldOverrideWriter,
  });

  const homeDir = baseDir ?? homedir();
  const contentDir = contentDirOverride ?? resolveContentDir();
  // Resolve the home declaration's sources, which refuses an unusable source or a content root whose declared format
  // this tool cannot honor before anything is written, dry-run included. `roots` is the search order every pass below
  // that reads undeclared content follows: each declared source in precedence order, then the built-in library.
  const { missingSources, roots } = await resolveDeclaredSources({
    baseDir: homeDir,
    contentDir,
    declaration: await resolveDeclaration({ cwd: homeDir, domain: 'home' }),
  });
  emitReport(missingSources.map(describeMissingSource));

  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  // Both arguments are the home directory: `install` deploys into the harness homes, so its declaration chain is the
  // home tier pair alone. Passing a project root would let a repository decide where the home domain deploys.
  const targets = await resolveTargetHarnesses({ harness: options.harness, cwd: homeDir, homeDir });
  const harnesses = targets.harnessIds;
  console.info(describeHarnessTargeting(targets));

  // Retire the withdrawn shared-guidance tier unconditionally, ahead of the no-target return: a home that targets no
  // harness still carries whatever a previous install left in `~/.agents/`.
  const didRetire = await retireSharedGuidance(manifest, options, baseDir);

  if (harnesses.length === 0) {
    if (!options.dryRun && didRetire) {
      await writeManifest(manifestPath, withoutSharedTier(manifest));
      console.info('\nManifest updated.');
    } else {
      console.info('Nothing else to install.');
    }
    if (!options.dryRun) {
      await recordHomeProvenance('install', baseDir);
    }
    return;
  }

  const updatedHarnesses: Partial<Record<HarnessId, HarnessManifest>> = { ...manifest.harnesses };

  for (const harnessId of harnesses) {
    console.info(`\nInstalling for harness: ${harnessId}`);
    const paths = resolveHarnessPaths(harnessId, baseDir);

    // Safety check: ensure target directories are not symlinks
    checkSymlinkSafety(paths.skillsDir);
    checkSymlinkSafety(paths.subagentsDir);
    checkSymlinkSafety(paths.scriptsDir);

    // Build lookup of previously installed entries for drift detection
    const existingEntries = manifest.harnesses[harnessId]?.entries ?? [];
    const existingByPath = new Map(existingEntries.map((e) => [e.relativePath, e]));

    const entries: Array<ManifestEntry> = [];

    const harnessConfig = HARNESSES[harnessId];
    const templateVariables: TemplateVariables = {
      guidanceFileName: harnessConfig.guidanceFileName,
      harnessId: harnessConfig.id,
      homeDir: harnessConfig.homeDir,
    };

    // Install skill support directories (e.g. `_data`). Skills themselves deploy per-declaration via `sync`.
    const skillsPrefix = resolveSkillsPathPrefix(harnessConfig);
    const supportEntries = await installSupportDirectories(
      contentDir,
      paths.skillsDir,
      paths.harnessHome,
      existingByPath,
      options,
      skillsPrefix,
      templateVariables,
      harnessConfig.skillSigil,
      harnessConfig.subagentSigil,
    );
    entries.push(...supportEntries);

    // Install scripts
    const scriptEntries = await installScripts(
      roots,
      paths.scriptsDir,
      paths.harnessHome,
      harnessConfig,
      existingByPath,
      options,
    );
    entries.push(...scriptEntries);

    // Wire the session-lifecycle hook entries once the relay script is in place, so the configured commands point at
    // a script that exists. `--skip-hooks` leaves the harness config untouched. A failure — an unparseable config —
    // costs the hooks a warning, never the rest of the install: the manifest must still record what was copied.
    if (options.hooks !== false) {
      if (options.dryRun) {
        console.info('    [hooks] Would wire session-lifecycle hook entries');
      } else {
        try {
          await ensureHarnessHookEntries(harnessId, baseDir);
        } catch (error) {
          console.warn(`  ⚠️ Skipping hook wiring: ${describeError(error)} (fix the config, then run configure-hooks)`);
        }
      }
    }

    // Install harness-specific guidance file
    const guidanceEntries = await installHarnessGuidance(roots, paths, harnessId, existingByPath, options);
    entries.push(...guidanceEntries);

    // Reconcile against the previous manifest: remove files whose source was deleted. Runs before the dry-run
    // gate so `--dry-run` previews removals. User-modified orphans are kept (unless `--force`) and stay tracked.
    const pruned = await pruneOrphanedEntries(existingEntries, entries, paths.harnessHome, options);
    entries.push(...pruned.retained);
    emitReport(describePruneResult(pruned, options));

    if (options.dryRun) {
      console.info(`  [dry-run] Would install ${entries.length} items:`);
      console.info(`    ${supportEntries.length} skill support items`);
      console.info(`    ${scriptEntries.length} script items`);
      console.info(`    ${guidanceEntries.length} guidance items`);
      continue;
    }

    updatedHarnesses[harnessId] = {
      harness: harnessId,
      version: readRunningPackageVersion(),
      installedAt: new Date().toISOString(),
      entries,
    };
    console.info(`  ✅ Installed ${entries.length} items for ${harnessId}`);
  }

  if (!options.dryRun) {
    const updatedManifest: AgentsManifest = {
      ...withoutSharedTier(manifest),
      harnesses: updatedHarnesses,
    };
    await writeManifest(manifestPath, updatedManifest);
    console.info('\nManifest updated.');
    await recordHomeProvenance('install', baseDir);
  }
}

/**
 * Installs skill support directories (e.g. `_data`) into the target skills directory. Skills themselves — any
 * `content/skills/<slug>/` holding a `SKILL.md` — deploy per-declaration via `sync`, not here, so this pass installs
 * only the non-skill support entries; `_partials` (an install-time include target) and dotfiles are excluded.
 *
 * If a previously installed item has been modified by the user, it is skipped unless `--force` is set,
 * mirroring the uninstall command's drift-checking behavior.
 */
async function installSupportDirectories(
  contentDir: string,
  skillsDestDir: string,
  harnessHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  skillsPrefix: string,
  variables: TemplateVariables,
  skillSigil: string,
  subagentSigil: string,
): Promise<ReadonlyArray<ManifestEntry>> {
  const skillsSrcDir = path.join(contentDir, 'skills');
  const entries: Array<ManifestEntry> = [];

  // `listSupportEntries` reports an absent directory as empty, so the absence is probed separately: content shipping no
  // `skills/` has lost the support files every skill reads at runtime, and a silent success would hide that.
  try {
    await stat(skillsSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(`  ⚠️ Warning: no skills directory found at ${skillsSrcDir}, skipping skill support installation`);
    return [];
  }

  // Install non-skill support directories (e.g. `_data`, which skills reference at runtime by absolute path). What
  // counts as one is `listSupportEntries`, shared with `validate` so the pass that checks these and the pass that
  // deploys them cannot come to disagree about which entries they are.
  const supportEntries = await listSupportEntries(skillsSrcDir);
  for (const entry of supportEntries) {
    const result = await installSkillEntry(
      path.join(skillsSrcDir, entry),
      path.join(skillsDestDir, entry),
      `skills/${entry}`,
      `skills/${entry}`,
      harnessHome,
      existingByPath,
      options,
      skillsPrefix,
      variables,
      contentDir,
      skillSigil,
      subagentSigil,
    );
    if (result !== undefined) {
      entries.push(result);
    }
  }

  return entries;
}

/**
 * Installs a single skill entry (directory or file) from source to destination.
 * Skills are always copied and rewritten (never symlinked), because they require path transformation at install time
 * — the same pattern subagents use for frontmatter merging.
 */
async function installSkillEntry(
  srcPath: string,
  destPath: string,
  relativePath: string,
  sourceRelativeRoot: string,
  harnessHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  skillsPrefix: string,
  variables: TemplateVariables,
  contentDir: string,
  skillSigil: string,
  subagentSigil: string,
  label = '',
): Promise<ManifestEntry | undefined> {
  // Eagerly render the entry before the dry-run gate, so missing include targets, cycles, out-of-tree references,
  // dead anchors, and unmapped tool placeholders surface even when no files are written. `renderSupportEntry` is the
  // same render `validate` runs, which is what keeps the two passes agreeing on what a support entry is.
  const rendered = await renderSupportEntry(srcPath, path.basename(destPath), contentDir, {
    anchor: homeAnchor(skillsPrefix),
    guidanceFileName: variables.guidanceFileName,
    homeDir: variables.homeDir,
    harnessId: variables.harnessId,
    skillSigil,
    subagentSigil,
  });

  // A support directory holding only dotfiles or `_partials/` renders to zero entries — nothing to install. Skip it
  // entirely: no destination, no markers, no manifest entry. The orphan-prune pass clears any previously installed copy.
  if (rendered.kind === 'directory' && rendered.entries.length === 0) {
    console.info(`    [skip] ${relativePath}${label ? ` ${label}` : ''} (no installable entries)`);
    return undefined;
  }

  if (options.dryRun) {
    console.info(`    [copy] ${relativePath}${label ? ` ${label}` : ''}`);
    return { relativePath, contentHash: 'dry-run', linked: false };
  }

  // Check for user modifications before overwriting
  const existingEntry = existingByPath.get(relativePath);
  if (existingEntry && !options.force) {
    const drift = await detectDrift(existingEntry, harnessHome);
    if (drift === 'modified') {
      console.warn(`  ⚠️ Skipping modified item: ${relativePath}`);
      return existingEntry;
    }
  }

  if (rendered.kind === 'directory') {
    // Clean-write directories CodeAssembly previously installed: remove the prior copy so files deleted from the
    // source skill don't survive in the destination. Gated on prior ownership (a manifest entry exists) so a
    // first-time install never wipes a coincidentally same-named directory the user already had.
    if (existingEntry) {
      await removeItem(destPath);
    }
    await writeRenderedSkillDir(destPath, rendered.entries);
    await injectMarkersInDirectory(destPath, (fileRelPath) => buildSourceUrl(`${sourceRelativeRoot}/${fileRelPath}`));
  } else if (rendered.kind === 'markdown') {
    // Single-file `.md` skill entries: write the previously expanded content directly.
    // Skipping the verbatim copy avoids the expand-copy-expand-overwrite redundancy
    // and ensures the validated content is the content written to disk (no second read).
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, rendered.content, 'utf8');
    await injectMarkerInFile(destPath, buildSourceUrl(sourceRelativeRoot));
  } else {
    // Single-file non-`.md` skill entries: plain copy, no expansion.
    await copyItem(srcPath, destPath);
  }

  return {
    relativePath,
    contentHash: rendered.kind === 'directory' ? `sha256:dir:${relativePath}` : await computeContentHash(destPath),
    linked: false,
  };
}

/**
 * Writes a rendered skill directory to `destDir`: markdown entries are written from their transformed content, asset
 * entries are copied verbatim from source. Each entry's parent directory is created as needed.
 */
async function writeRenderedSkillDir(destDir: string, entries: ReadonlyArray<RenderedSkillEntry>): Promise<void> {
  for (const entry of entries) {
    const destPath = path.join(destDir, entry.relPath);
    await mkdir(path.dirname(destPath), { recursive: true });
    await (entry.kind === 'markdown' ? writeFile(destPath, entry.content, 'utf8') : copyItem(entry.srcPath, destPath));
  }
}

/**
 * Installs script files from every content root's `scripts/` directory into the target scripts directory.
 * Scripts are flat files (no frontmatter, no harness-specific variants), so the roots merge by file name rather than
 * one root owning the directory.
 * Copied scripts receive the executable bit (0o755); symlinked scripts inherit the source's permissions.
 */
async function installScripts(
  roots: ReadonlyArray<ContentRootRef>,
  scriptsDestDir: string,
  harnessHome: string,
  harnessConfig: HarnessConfig,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const { claims, foundDirectory, warnings } = await collectScriptClaims(roots);
  emitReport(warnings);
  if (!foundDirectory) {
    console.warn('  ⚠️ Warning: no scripts directory found in any content root, skipping script installation');
    return [];
  }

  const entries: Array<ManifestEntry> = [];

  for (const [entry, srcPath] of claims) {
    const destPath = path.join(scriptsDestDir, entry);
    const relativePath = `${harnessConfig.scriptsDirName}/${entry}`;

    if (options.dryRun) {
      const action = options.link ? 'link' : 'copy';
      console.info(`    [${action}] ${relativePath}`);
      entries.push({ relativePath, contentHash: 'dry-run', linked: options.link });
      continue;
    }

    // Check for user modifications before overwriting
    const existingEntry = existingByPath.get(relativePath);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessHome);
      if (drift === 'modified') {
        console.warn(`  ⚠️ Skipping modified item: ${relativePath}`);
        entries.push(existingEntry);
        continue;
      }
    }

    await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

    // Ensure copied scripts are executable
    if (!options.link) {
      await chmod(destPath, 0o755);
    }

    // Compute hash from source for symlinked scripts (dest symlink may not resolve in all environments)
    const hashPath = options.link ? srcPath : destPath;
    entries.push({
      relativePath,
      contentHash: await computeContentHash(hashPath),
      linked: options.link,
    });
  }

  return entries;
}

/**
 * Installs harness-specific guidance files from `content/guidance/_harnesses/{harnessId}/` into the harness
 * home directory. Harness guidance is always copied and rewritten (never symlinked), because install-time path
 * rewriting produces absolute link targets that agents can resolve without knowing a path convention.
 */
async function installHarnessGuidance(
  roots: ReadonlyArray<ContentRootRef>,
  harnessPaths: { harnessHome: string },
  harnessId: HarnessId,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const harnessConfig = HARNESSES[harnessId];
  const shippingRoots = await findTemplateRoots(roots, harnessId);
  const owner = shippingRoots.at(0);
  if (owner === undefined) {
    console.warn(
      `  ⚠️ Warning: no ${harnessId} guidance directory found in any content root, skipping harness guidance installation`,
    );
    return [];
  }
  const shadowed = shippingRoots.slice(1);
  if (shadowed.length > 0) {
    emitReport([
      {
        level: 'warn',
        text:
          `  ⚠️ The ${harnessId} guidance template is shipped by more than one content root: installing it from ` +
          `${describeContentRoot(owner.root)} and ignoring ${shadowed.map((shipping) => describeContentRoot(shipping.root)).join(', ')}.`,
      },
    ]);
  }

  const guidanceSrcDir = path.join(owner.root.dir, 'guidance', '_harnesses', harnessId);

  const entries: Array<ManifestEntry> = [];

  for (const entry of owner.fileNames) {
    const srcPath = path.join(guidanceSrcDir, entry);
    const destPath = path.join(harnessPaths.harnessHome, entry);

    // Resolve include directives at source-tree level, strip the guidance-hook declarations the expansion carried in,
    // then check the result for anchors that name nothing. All three run before the dry-run gate so missing targets,
    // cycles, out-of-tree references, malformed hooks, and dead in-body locators surface even when no files are
    // written.
    let expandedContent: string | undefined;
    if (entry.endsWith('.md')) {
      const sourceLabel = `guidance/_harnesses/${harnessId}/${entry}`;
      expandedContent = stripGuidanceHooks(await expandIncludes(srcPath, owner.root.dir), sourceLabel);
      assertAnchorsResolve(expandedContent, sourceLabel);
    }

    if (options.dryRun) {
      console.info(`    [copy] ${entry} (guidance)`);
      entries.push({ relativePath: entry, contentHash: 'dry-run', linked: false });
      continue;
    }

    // Check for user modifications before overwriting
    const existingEntry = existingByPath.get(entry);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessPaths.harnessHome);
      if (drift === 'modified') {
        console.warn(`  ⚠️ Skipping modified item: ${harnessConfig.homeDir}/${entry}`);
        entries.push(existingEntry);
        continue;
      }
    }

    // The wholesale re-render below would drop whatever sync wrote into the ambient region, so capture the existing
    // destination's region content first; it is spliced back once the fresh render is in place.
    const preservedAmbient = entry.endsWith('.md') ? await readAmbientRegionContent(destPath) : undefined;

    await unlinkIfSymlink(destPath);
    await copyItem(srcPath, destPath);

    // For .md files, replace the freshly-copied content with the include-expanded content, then run downstream link
    // rewriting and template/marker injection on the expanded text.
    if (entry.endsWith('.md')) {
      if (expandedContent !== undefined) {
        await writeFile(destPath, expandedContent, 'utf8');
      }
      await rewritePathsInFile(destPath, entry, harnessConfig.homeDir, {
        guidanceFileName: harnessConfig.guidanceFileName,
        harnessId: harnessConfig.id,
        homeDir: harnessConfig.homeDir,
      });
      await injectMarkerInFile(destPath, buildSourceReference(owner.root, `guidance/_harnesses/${harnessId}/${entry}`));

      // Splice the preserved region content into the fresh render. The region's location comes from the template;
      // its content belongs to sync and must survive an install. A template that no longer carries the region wins:
      // the content is dropped and the next `sync` re-delivers or warns.
      if (preservedAmbient !== undefined && preservedAmbient !== '') {
        const rendered = await readFile(destPath, 'utf8');
        if (hasAmbientRegion(rendered)) {
          await writeFile(destPath, injectAmbientRegion(rendered, preservedAmbient), 'utf8');
        }
      }
    }

    entries.push({
      relativePath: entry,
      contentHash: await computeContentHash(destPath),
      linked: false,
    });
  }

  return entries;
}

/**
 * Collects the installable scripts across `roots`, keyed by file name, taking each name from the highest-precedence
 * root that ships it. A name a lower-precedence root also ships is dropped and reported: scripts deploy into one flat
 * directory, and their file names are undeclared, so a collision states none of the override intent a declared
 * artifact's slug does.
 *
 * `foundDirectory` distinguishes a run where no root ships a `scripts/` directory at all from one where the
 * directories exist and hold nothing installable, because only the first is worth a warning.
 */
async function collectScriptClaims(roots: ReadonlyArray<ContentRootRef>): Promise<{
  claims: ReadonlyMap<string, string>;
  foundDirectory: boolean;
  warnings: ReadonlyArray<ReportLine>;
}> {
  const claims = new Map<string, string>();
  const claimants = new Map<string, ContentRootRef>();
  const warnings: Array<ReportLine> = [];
  let foundDirectory = false;

  for (const root of roots) {
    const scriptsSrcDir = path.join(root.dir, 'scripts');
    let dirEntries: ReadonlyArray<string>;
    try {
      dirEntries = await readdir(scriptsSrcDir);
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      continue;
    }
    foundDirectory = true;

    for (const entry of dirEntries) {
      if (entry.startsWith('.')) {
        continue;
      }

      // Skip non-script files (e.g. README.md); only helper scripts ship to harness homes.
      if (SCRIPT_EXTENSIONS.every((extension) => !entry.endsWith(extension))) {
        continue;
      }

      const srcPath = path.join(scriptsSrcDir, entry);

      // Skip directories (e.g. __tests__)
      if (!(await stat(srcPath)).isFile()) {
        continue;
      }

      const claimant = claimants.get(entry);
      if (claimant !== undefined) {
        warnings.push({
          level: 'warn',
          text:
            `  ⚠️ Script ${entry} is shipped by more than one content root: installing it from ` +
            `${describeContentRoot(claimant)} and ignoring ${describeContentRoot(root)}.`,
        });
        continue;
      }
      claims.set(entry, srcPath);
      claimants.set(entry, root);
    }
  }

  return { claims, foundDirectory, warnings };
}

/**
 * Reports the roots shipping a guidance template for `harnessId`, highest precedence first, each paired with the file
 * names it installs. A root ships a template when its `guidance/_harnesses/<harnessId>/` directory holds at least one
 * such file; a directory that is absent, or holds only dotfiles and subdirectories, ships nothing, so it cannot shadow
 * the root that would otherwise supply the harness.
 *
 * The file names travel with the root so selection and installation apply one definition of an installable entry.
 * `copyItem` copies a directory recursively and `computeContentHash` reads a file, so an entry the two passes
 * classified differently would be written to the harness home and then fail the hash that records it.
 *
 * Ownership is whole-directory rather than per file, which is what keeps the template's `guidance/shared/AGENTS.md`
 * include resolving inside the one root the template came from.
 */
async function findTemplateRoots(
  roots: ReadonlyArray<ContentRootRef>,
  harnessId: HarnessId,
): Promise<ReadonlyArray<TemplateRoot>> {
  const shipping: Array<TemplateRoot> = [];
  for (const root of roots) {
    const templateDir = path.join(root.dir, 'guidance', '_harnesses', harnessId);
    let dirEntries: ReadonlyArray<string>;
    try {
      dirEntries = await readdir(templateDir);
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      continue;
    }

    const fileNames: Array<string> = [];
    for (const entry of dirEntries) {
      if (entry.startsWith('.')) {
        continue;
      }
      if ((await stat(path.join(templateDir, entry))).isFile()) {
        fileNames.push(entry);
      }
    }
    if (fileNames.length > 0) {
      shipping.push({ root, fileNames });
    }
  }
  return shipping;
}

/**
 * Reads the ambient-region content of the file at `filePath`, returning `undefined` when the file is absent or
 * carries no complete region.
 */
async function readAmbientRegionContent(filePath: string): Promise<string | undefined> {
  try {
    return extractAmbientRegionContent(await readFile(filePath, 'utf8'));
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}
