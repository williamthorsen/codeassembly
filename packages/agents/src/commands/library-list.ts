import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parse as parseYaml } from 'yaml';

import { ARTIFACT_TYPES, type ArtifactType } from '../lib/artifact-types.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import { readDeploy } from '../lib/deploy-frontmatter.ts';
import { parseFrontmatter } from '../lib/frontmatter-merger.ts';
import { listVisibleMarkdownFiles } from '../lib/fs-helpers.ts';
import { listSkillDirectories } from '../lib/library-catalog.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { isRecord } from '../lib/type-guards.ts';

/** A single artifact's normalized listing fields, before its type and emoji are attached. */
interface ArtifactEntry {
  readonly slug: string;
  readonly delivery: string;
  readonly description: string;
}

/** A listing row: an artifact entry tagged with its display type and emoji. */
export interface LibraryRow extends ArtifactEntry {
  readonly type: ArtifactType;
  readonly emoji: string;
}

/** Pairs an artifact type with its display emoji and the enumerator that lists it from a content directory. */
interface ArtifactDescriptor {
  readonly type: ArtifactType;
  readonly emoji: string;
  list(contentDir: string): Promise<Array<ArtifactEntry>>;
}

/** The types enumerated by `library list`, in display order. */
const ARTIFACT_DESCRIPTORS: ReadonlyArray<ArtifactDescriptor> = [
  { type: 'rulebook', emoji: '📕', list: listRulebooks },
  { type: 'skill', emoji: '🪄', list: listSkills },
  { type: 'subagent', emoji: '🤖', list: listSubagents },
  { type: 'collection', emoji: '📦', list: listCollections },
];

/** Rank used to group rows by type before the within-type slug sort. */
const TYPE_ORDER: Readonly<Record<ArtifactType, number>> = { rulebook: 0, skill: 1, subagent: 2, collection: 3 };

/** Delivery cell for a collection: a collection has no `deploy` field and so no delivery mode. */
const COLLECTION_DELIVERY = '—';

const HEADERS = { type: 'type', slug: 'slug', delivery: 'delivery', description: 'description' } as const;

/** Width assumed for piped output, where no terminal width is available; keeps such output deterministic. */
const DEFAULT_WIDTH = 100;
/** Spaces between adjacent columns. */
const COLUMN_GAP = 2;
/** Display cells occupied by a type emoji — all chosen emoji are East-Asian wide (two cells). */
const EMOJI_DISPLAY_WIDTH = 2;
/** Floor for the description column so a narrow terminal still wraps rather than collapses it. */
const MIN_DESCRIPTION_WIDTH = 20;

/**
 * Enumerates the content library's rulebooks, skills, and subagents and prints them as an aligned table.
 * `contentDir` defaults to the resolved package content directory; tests inject a fixture tree.
 */
export async function libraryListCommand(contentDir: string = resolveContentDir()): Promise<void> {
  const rows: Array<LibraryRow> = [];
  for (const descriptor of ARTIFACT_DESCRIPTORS) {
    const entries = await descriptor.list(contentDir);
    for (const entry of entries) {
      rows.push({ ...entry, type: descriptor.type, emoji: descriptor.emoji });
    }
  }

  // `columns` is absent (undefined at runtime, despite its `number` type) when stdout is piped; fall back to a
  // fixed width there so redirected and captured output stays deterministic.
  const width = process.stdout.isTTY ? process.stdout.columns : DEFAULT_WIDTH;
  console.info(renderLibraryTable(rows, width));
}

/** Prints usage information for the `library` command. */
export function printLibraryUsage(): void {
  console.info(`Usage: codeassembly-agents library <subcommand>

Subcommands:
  list   List available library artifacts (rulebooks, skills, subagents, collections)`);
}

/**
 * Renders rows as an aligned table — type (emoji + label), slug, delivery, then a hanging-indent-wrapped
 * description — sorted by type then slug. `width` bounds the description column; the others size to their
 * content. Pure and deterministic for a given (rows, width).
 */
export function renderLibraryTable(rows: ReadonlyArray<LibraryRow>, width: number): string {
  const sorted = rows.toSorted(compareRows);

  const typeColWidth = Math.max(HEADERS.type.length, ...sorted.map((row) => EMOJI_DISPLAY_WIDTH + 1 + row.type.length));
  const slugColWidth = Math.max(HEADERS.slug.length, ...sorted.map((row) => row.slug.length));
  const deliveryColWidth = Math.max(HEADERS.delivery.length, ...sorted.map((row) => row.delivery.length));
  const prefixWidth = typeColWidth + COLUMN_GAP + slugColWidth + COLUMN_GAP + deliveryColWidth + COLUMN_GAP;
  const descriptionWidth = Math.max(MIN_DESCRIPTION_WIDTH, width - prefixWidth);

  const gap = ' '.repeat(COLUMN_GAP);
  const indent = ' '.repeat(prefixWidth);

  const headerPrefix =
    HEADERS.type.padEnd(typeColWidth) +
    gap +
    HEADERS.slug.padEnd(slugColWidth) +
    gap +
    HEADERS.delivery.padEnd(deliveryColWidth) +
    gap;
  const lines: Array<string> = [(headerPrefix + HEADERS.description).trimEnd()];

  for (const row of sorted) {
    const prefix =
      padType(row.emoji, row.type, typeColWidth) +
      gap +
      row.slug.padEnd(slugColWidth) +
      gap +
      row.delivery.padEnd(deliveryColWidth) +
      gap;
    const [first = '', ...rest] = wrapText(row.description, descriptionWidth);
    lines.push((prefix + first).trimEnd());
    for (const continuation of rest) {
      lines.push((indent + continuation).trimEnd());
    }
  }

  return lines.join('\n');
}

// region | Helpers

/** Runs `build` to produce an artifact entry, warning to stderr and skipping (returning `undefined`) if it throws. */
function buildEntryOrSkip(type: ArtifactType, source: string, build: () => ArtifactEntry): ArtifactEntry | undefined {
  try {
    return build();
  } catch (error) {
    warnSkipped(type, source, error);
    return undefined;
  }
}

/** Orders rows by artifact type, then by slug. */
function compareRows(a: LibraryRow, b: LibraryRow): number {
  if (a.type !== b.type) {
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  }
  return a.slug.localeCompare(b.slug);
}

/** Lists collection artifacts from `content/collections`, reading each markdown file's name and description. */
async function listCollections(contentDir: string): Promise<Array<ArtifactEntry>> {
  const dir = path.join(contentDir, ARTIFACT_TYPES.collection.contentPath);
  const entries: Array<ArtifactEntry> = [];
  for (const file of await listVisibleMarkdownFiles(dir)) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const entry = buildEntryOrSkip('collection', file, () => {
      const meta = readNameAndDescription(content);
      return {
        slug: meta.name ?? path.basename(file, '.md'),
        delivery: COLLECTION_DELIVERY,
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
  for (const file of await listVisibleMarkdownFiles(dir)) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const entry = buildEntryOrSkip('rulebook', file, () => {
      const { rulebook } = parseRulebookFile(content, file);
      return {
        slug: rulebook.slug,
        delivery: rulebook.delivery.join(', '),
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
  for (const name of await listSkillDirectories(dir)) {
    const content = await readFile(path.join(dir, name, 'SKILL.md'), 'utf8');
    const entry = buildEntryOrSkip('skill', name, () => {
      const meta = readNameAndDescription(content);
      // The delivery column mirrors the `deploy` field: `declared` (delivered per-project by sync) or `install`.
      return {
        slug: meta.name ?? name,
        delivery: readDeploy(content, `skills/${name}/SKILL.md`),
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
  for (const file of await listVisibleMarkdownFiles(dir)) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const entry = buildEntryOrSkip('subagent', file, () => {
      const meta = readNameAndDescription(content);
      // The delivery column mirrors the `deploy` field: `declared` (delivered per-project by sync) or `install`.
      return {
        slug: meta.name ?? path.basename(file, '.md'),
        delivery: readDeploy(content, `subagents/${file}`),
        description: meta.description ?? '',
      };
    });
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Builds a type cell (`{emoji} {label}`) padded with trailing spaces to `colWidth` display cells. */
function padType(emoji: string, label: string, colWidth: number): string {
  const padding = Math.max(0, colWidth - (EMOJI_DISPLAY_WIDTH + 1 + label.length));
  return `${emoji} ${label}${' '.repeat(padding)}`;
}

/** Extracts the `name` and `description` strings from a markdown file's frontmatter, when present. */
function readNameAndDescription(content: string): { name?: string; description?: string } {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return {};
  }
  const meta: { name?: string; description?: string } = {};
  if (typeof parsed.name === 'string') {
    meta.name = parsed.name;
  }
  if (typeof parsed.description === 'string') {
    meta.description = parsed.description;
  }
  return meta;
}

/** Warns to stderr that an artifact was skipped because its frontmatter could not be parsed. */
function warnSkipped(type: ArtifactType, file: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`  ⚠️ Skipping ${type} ${file}: ${reason}`);
}

/** Greedily wraps `text` into lines no wider than `width`; a word longer than `width` overflows on its own line. */
function wrapText(text: string, width: number): Array<string> {
  const lines: Array<string> = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

// endregion | Helpers
