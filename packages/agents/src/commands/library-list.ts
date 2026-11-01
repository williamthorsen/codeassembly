import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { ARTIFACT_TYPES, type ArtifactType } from '../lib/artifact-types.ts';
import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import { describeMissingSource, resolveDeclaredSources } from '../lib/declared-sources.ts';
import { emitReport, printLine, readOutputStyle } from '../lib/emit-report.ts';
import { parseFrontmatter } from '../lib/frontmatter-merger.ts';
import { listVisibleMarkdownFiles } from '../lib/fs-helpers.ts';
import { SUPPORTED_HARNESSES_KEY } from '../lib/harness.ts';
import { listSkillDirectories } from '../lib/library-catalog.ts';
import { resolveTerminalWidth } from '../lib/resolve-terminal-width.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { isRecord } from '../lib/type-guards.ts';
import { type LibraryRow, renderLibraryTable } from './render-library-table.ts';

/**
 * A single artifact's normalized listing fields, before its type is attached. `delivery` is undefined for an artifact
 * that doesn't declare a delivery mode.
 */
interface ArtifactEntry {
  readonly slug: string;
  readonly delivery: string | undefined;
  readonly description: string;
}

/** Pairs an artifact type with the enumerator that lists it from a content directory. */
interface ArtifactDescriptor {
  readonly type: ArtifactType;
  list(contentDir: string): Promise<Array<ArtifactEntry>>;
}

/** The types enumerated by `library list`, in display order. */
const ARTIFACT_DESCRIPTORS: ReadonlyArray<ArtifactDescriptor> = [
  { type: 'rulebook', list: listRulebooks },
  { type: 'skill', list: listSkills },
  { type: 'subagent', list: listSubagents },
  { type: 'collection', list: listCollections },
];

/**
 * One declared source in the `--json` listing: its name, its absolute content directory, and its artifacts, each with
 * its delivery value when it declares one.
 */
export interface LibrarySourceListing {
  readonly name: string;
  readonly dir: string;
  readonly artifacts: ReadonlyArray<{ readonly type: ArtifactType; readonly slug: string; readonly delivery?: string }>;
}

/**
 * Enumerates the artifacts of every source declared by the chain that `sync` reads from `cwd`, or by the home chain
 * when `global` is set, and prints them as an aligned table, or under `json` as `{ sources: LibrarySourceListing[] }`
 * in precedence order. Throws when the chain does not declare a usable source.
 */
export async function libraryListCommand(
  options: { global: boolean; json?: boolean },
  cwd: string = process.cwd(),
  homeDir: string = homedir(),
): Promise<void> {
  const baseDir = options.global ? homeDir : cwd;
  const domain = options.global ? 'home' : 'project';
  const { missingSources, roots } = await resolveDeclaredSources({
    baseDir,
    declaration: await resolveDeclaration({ cwd: baseDir, domain }),
  });
  emitReport(missingSources.map(describeMissingSource));

  const rows: Array<LibraryRow> = [];
  const sources: Array<LibrarySourceListing> = [];
  const seen = new Set<string>();
  for (const [precedence, root] of roots.entries()) {
    const artifacts: Array<LibrarySourceListing['artifacts'][number]> = [];
    for (const descriptor of ARTIFACT_DESCRIPTORS) {
      const entries = await descriptor.list(root.dir);
      for (const entry of entries) {
        const key = `${descriptor.type}:${entry.slug}`;
        rows.push({ ...entry, type: descriptor.type, source: root.name, precedence, isShadowed: seen.has(key) });
        artifacts.push({
          type: descriptor.type,
          slug: entry.slug,
          ...(entry.delivery !== undefined && { delivery: entry.delivery }),
        });
        seen.add(key);
      }
    }
    sources.push({ name: root.name, dir: path.resolve(root.dir), artifacts });
  }

  if (options.json === true) {
    console.info(JSON.stringify({ sources }, null, 2));
    return;
  }
  console.info(renderLibraryTable(rows, resolveTerminalWidth(), readOutputStyle('stdout')));
}

/** Prints usage information for the `library` command. */
export function printLibraryUsage(): void {
  console.info(`Usage: codeassembly library <subcommand> [options]

Subcommands:
  list   List the artifacts (rulebooks, skills, subagents, collections) of every declared source

Options:
  --global   List the sources declared by the home chain (~/.agents/codeassembly.yaml) instead of the project's
  --json     Print each declared source's name, content directory, and artifacts as JSON instead of a table`);
}

// region | Helpers

/** Runs `build` to produce an artifact entry, warning to stderr and skipping it if it throws. */
function buildEntryOrSkip(type: ArtifactType, source: string, build: () => ArtifactEntry): ArtifactEntry | undefined {
  try {
    return build();
  } catch (error) {
    warnSkipped(type, source, error);
    return undefined;
  }
}

/** Lists collection artifacts from `content/collections`, reading each markdown file's name and description. */
async function listCollections(contentDir: string): Promise<Array<ArtifactEntry>> {
  const dir = path.join(contentDir, ARTIFACT_TYPES.collection.contentPath);
  const entries: Array<ArtifactEntry> = [];
  const files = await listVisibleMarkdownFiles(dir);
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const entry = buildEntryOrSkip('collection', file, () => {
      const meta = readNameAndDescription(content);
      return {
        slug: meta.name ?? path.basename(file, '.md'),
        delivery: undefined,
        description: meta.description ?? '',
      };
    });
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Lists rulebook artifacts from `content/guidance/rulebooks`, parsing each via the rulebook schema. */
async function listRulebooks(contentDir: string): Promise<Array<ArtifactEntry>> {
  const dir = path.join(contentDir, ARTIFACT_TYPES.rulebook.contentPath);
  const entries: Array<ArtifactEntry> = [];
  const files = await listVisibleMarkdownFiles(dir);
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const entry = buildEntryOrSkip('rulebook', file, () => {
      const { rulebook } = parseRulebookFile(content, file);
      return {
        slug: rulebook.slug,
        delivery: formatRulebookDelivery(rulebook.delivery, rulebook[SUPPORTED_HARNESSES_KEY]),
        description: rulebook.description ?? '',
      };
    });
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Lists skill artifacts from `content/skills`, reading each `<slug>/SKILL.md` frontmatter. */
async function listSkills(contentDir: string): Promise<Array<ArtifactEntry>> {
  const dir = path.join(contentDir, ARTIFACT_TYPES.skill.contentPath);
  const entries: Array<ArtifactEntry> = [];
  const names = await listSkillDirectories(dir);
  for (const name of names) {
    const content = await readFile(path.join(dir, name, 'SKILL.md'), 'utf8');
    const entry = buildEntryOrSkip('skill', name, () => {
      const meta = readNameAndDescription(content);
      return {
        slug: meta.name ?? name,
        delivery: readHarnessAffinity(content),
        description: meta.description ?? '',
      };
    });
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Lists subagent artifacts from `content/subagents`, reading each markdown file's frontmatter. */
async function listSubagents(contentDir: string): Promise<Array<ArtifactEntry>> {
  const dir = path.join(contentDir, ARTIFACT_TYPES.subagent.contentPath);
  const entries: Array<ArtifactEntry> = [];
  const files = await listVisibleMarkdownFiles(dir);
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const entry = buildEntryOrSkip('subagent', file, () => {
      const meta = readNameAndDescription(content);
      return {
        slug: meta.name ?? path.basename(file, '.md'),
        delivery: undefined,
        description: meta.description ?? '',
      };
    });
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * Reads a skill's `supported-harnesses:` frontmatter for the delivery column, formatting it as the comma-joined
 * harness list that a skill targets, or undefined when the field is absent or empty (meaning all harnesses). Display-only
 * and tolerant: A non-string entry is dropped rather than rejected.
 */
function readHarnessAffinity(content: string): string | undefined {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  const declared = isRecord(parsed) ? parsed[SUPPORTED_HARNESSES_KEY] : undefined;
  if (declared === undefined || declared === null) {
    return undefined;
  }
  const values = Array.isArray(declared) ? declared : [declared];
  const harnesses = values.filter((value): value is string => typeof value === 'string');
  return harnesses.length === 0 ? undefined : harnesses.join(', ');
}

/**
 * Formats a rulebook's delivery cell: its delivery modes, followed by the harnesses to which it deploys in parentheses
 * when it narrows them.
 */
function formatRulebookDelivery(
  modes: ReadonlyArray<string>,
  targetHarnesses: ReadonlyArray<string> | undefined,
): string {
  const delivery = modes.join(', ');
  return targetHarnesses === undefined ? delivery : `${delivery} (${targetHarnesses.join(', ')})`;
}

/** Extracts the `name` and `description` strings from a markdown file's frontmatter, when present. */
function readNameAndDescription(content: string): { name?: string; description?: string } {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return {};
  }
  const meta: { name?: string; description?: string } = {};
  if (typeof parsed['name'] === 'string') {
    meta.name = parsed['name'];
  }
  if (typeof parsed['description'] === 'string') {
    meta.description = parsed['description'];
  }
  return meta;
}

/** Warns to stderr that an artifact was skipped because its frontmatter could not be parsed. */
function warnSkipped(type: ArtifactType, file: string, error: unknown): void {
  const reason = describeError(error);
  printLine({ glyph: 'warning', indent: 2, level: 'warn', text: `Skipping ${type} ${file}: ${reason}` });
}

// endregion | Helpers
