import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { makeArtifactMarker } from './artifact-marker.ts';
import { artifactFrontmatterPath } from './artifact-types.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { ALL_HARNESS_IDS, isHarnessId } from './harness.ts';
import { writeRenderedTree } from './rendered-tree.ts';
import { renderSkillDirectory, type SkillDeployContext } from './skill-transform.ts';
import { isRecord } from './type-guards.ts';
import type { HarnessId } from './types.ts';

const skillMarker = makeArtifactMarker('skill');

/**
 * The frontmatter key by which a skill narrows itself to specific harnesses. Qualified rather than a bare `harnesses`,
 * which a declaration file uses for the unrelated job of choosing which harnesses a sync run targets.
 */
export const SUPPORTED_HARNESSES_KEY = 'supported-harnesses';

/**
 * Matches the key's own frontmatter line. Anchored at line start, which is what keeps it from also matching a longer
 * key ending in the same word — the qualifier is the whole point of the name.
 */
const SUPPORTED_HARNESSES_LINE = new RegExp(String.raw`^${SUPPORTED_HARNESSES_KEY}\s*:`);

/**
 * A declared skill resolved through the source resolver: its stable slug, the directory to copy from, the content root
 * its includes resolve against, the source it resolved from, and the harnesses it targets. `contentRoot` is the library
 * for a library skill and the declaring source for a source skill. `source` is the declaring source's name, or
 * `undefined` for the built-in library. `targetHarnesses` is absent when the skill carries no `supported-harnesses:` field,
 * meaning it deploys to all harnesses.
 */
export interface ResolvedSkill {
  readonly slug: string;
  readonly srcDir: string;
  readonly contentRoot: string;
  readonly source: string | undefined;
  readonly targetHarnesses?: ReadonlyArray<HarnessId>;
}

/**
 * Resolves a declared skill slug through the source resolver (declared sources first, then the library), confirming its
 * `SKILL.md` exists and reading the harnesses it targets from frontmatter. Carries the resolved content root — the
 * source or library directory the slug resolved from — so the render pass expands the skill's includes against its own
 * tree. A slug found in no source or the library throws an error naming every location searched; an unknown harness id
 * in the `supported-harnesses:` field throws naming the slug and the offending id.
 */
export async function resolveDeclaredSkill(slug: string, resolver: SourceResolver): Promise<ResolvedSkill> {
  const resolved = await resolver.resolve('skill', slug);
  if (resolved === undefined) {
    throw new Error(
      `Declared skill "${slug}" was not found in any of: ${describeSearchedLocations(resolver, 'skill', slug)}`,
    );
  }

  const contentRoot = resolved.dir;
  const srcDir = path.dirname(path.join(contentRoot, artifactFrontmatterPath('skill', slug)));
  const content = await readFile(path.join(srcDir, 'SKILL.md'), 'utf8');

  const targetHarnesses = readTargetHarnesses(content, slug);
  const base = { slug, srcDir, contentRoot, source: resolved.source };
  return targetHarnesses === undefined ? base : { ...base, targetHarnesses };
}

/**
 * Materializes a resolved skill into `destDir/` for one harness: every `.md` file is include-expanded and
 * tool-name/link/template-rewritten through the shared skill transform, non-`.md` files are mirrored verbatim, and the
 * declared-skill ownership marker is stamped into the deployed root `SKILL.md`.
 * The write is byte-stable: unchanged files are left untouched, and destination files the source no longer carries —
 * along with any directory left empty by their removal — are pruned, so re-deploying an unchanged skill makes no
 * filesystem change.
 */
export async function deploySkill(skill: ResolvedSkill, destDir: string, context: SkillDeployContext): Promise<void> {
  const entries = await renderSkillDirectory(skill.srcDir, skill.slug, skill.contentRoot, context);
  // Strip the build-only `supported-harnesses:` directive from the deployed root SKILL.md — it steers deployment, not the
  // harness, which would otherwise carry a frontmatter key it ignores.
  await writeRenderedTree(
    destDir,
    entries.map((entry) =>
      entry.kind === 'markdown' && entry.relPath === 'SKILL.md'
        ? { ...entry, content: skillMarker.injectMarker(stripHarnessesDirective(entry.content), skill.slug) }
        : entry,
    ),
  );
}

/**
 * Reads a skill's `supported-harnesses:` frontmatter field, normalizing a string or list into a harness-id array.
 * Returns `undefined` when the field is absent or empty, meaning the skill targets all harnesses. Throws when a listed
 * value is not a known harness id, naming the slug and the offending value.
 *
 * Exported so a caller asking whether a skill reaches every harness reads the narrowing here rather than modelling it.
 */
export function readTargetHarnesses(skillContent: string, slug: string): ReadonlyArray<HarnessId> | undefined {
  const { lines } = parseFrontmatter(skillContent);
  const parsed: unknown = parseYaml(lines.join('\n'));
  const declared = isRecord(parsed) ? parsed[SUPPORTED_HARNESSES_KEY] : undefined;
  if (declared === undefined || declared === null) {
    return undefined;
  }

  const values = Array.isArray(declared) ? declared : [declared];
  if (values.length === 0) {
    return undefined;
  }

  const harnesses: Array<HarnessId> = [];
  for (const value of values) {
    if (typeof value !== 'string' || !isHarnessId(value)) {
      throw new Error(
        `Skill "${slug}" declares an unknown harness "${String(value)}" in its \`${SUPPORTED_HARNESSES_KEY}:\` field; ` +
          `known harnesses are ${ALL_HARNESS_IDS.join(', ')}.`,
      );
    }
    harnesses.push(value);
  }
  return harnesses;
}

/** True when a skill targets `harnessId`; either it names no harnesses (so all of them) or lists this one. */
export function skillTargetsHarness(skill: ResolvedSkill, harnessId: HarnessId): boolean {
  return skill.targetHarnesses === undefined || skill.targetHarnesses.includes(harnessId);
}

// region | Helpers

/**
 * Removes the `supported-harnesses:` build directive from a skill's frontmatter, dropping the key line and any indented
 * block-continuation beneath it. Returns the content unchanged when the key is absent, so a skill that never declared
 * one is left byte-identical.
 */
function stripHarnessesDirective(content: string): string {
  const { lines, body } = parseFrontmatter(content);
  if (lines.every((line) => !SUPPORTED_HARNESSES_LINE.test(line))) {
    return content;
  }

  const kept: Array<string> = [];
  let skippingBlock = false;
  for (const line of lines) {
    if (skippingBlock) {
      if (/^\s/.test(line) && line.trim() !== '') {
        continue;
      }
      skippingBlock = false;
    }
    if (SUPPORTED_HARNESSES_LINE.test(line)) {
      skippingBlock = true;
      continue;
    }
    kept.push(line);
  }
  return `---\n${kept.join('\n')}\n---\n${body}`;
}

// endregion | Helpers
