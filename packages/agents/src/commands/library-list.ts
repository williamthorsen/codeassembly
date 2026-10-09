import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { defineGlyphSet, type Glyph, type OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';
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

/** A single artifact's normalized listing fields, before its type is attached. */
interface ArtifactEntry {
  readonly slug: string;
  readonly delivery: string;
  readonly description: string;
}

/**
 * A listing row: an artifact entry tagged with its type, the source that ships it, that source's rank in precedence
 * order (0 = highest), and whether a higher-precedence source ships the same `(type, slug)`.
 */
export interface LibraryRow extends ArtifactEntry {
  readonly type: ArtifactType;
  readonly source: string;
  readonly precedence: number;
  readonly isShadowed: boolean;
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

/** The glyph leading each type's cell; plain output has none, leaving the label alone. */
const TYPE_GLYPHS = defineGlyphSet<ArtifactType>({
  collection: { plain: '', rich: '📦' },
  rulebook: { plain: '', rich: '📕' },
  skill: { plain: '', rich: '🪄' },
  subagent: { plain: '', rich: '🤖' },
});

/** Rank used to group rows by type before the within-type slug sort. */
const TYPE_ORDER: Readonly<Record<ArtifactType, number>> = { rulebook: 0, skill: 1, subagent: 2, collection: 3 };

/** Delivery cell for an artifact type that doesn't declare a delivery mode. */
const NO_DELIVERY_MODE = '—';

const HEADERS = {
  type: 'type',
  slug: 'slug',
  source: 'source',
  delivery: 'delivery',
  description: 'description',
} as const;

const COLUMN_GAP = 2;
/** Floor for the description column so that a narrow terminal still wraps rather than collapses it. */
const MIN_DESCRIPTION_WIDTH = 20;

/**
 * Enumerates the artifacts of every source declared by the chain that `sync` reads from `cwd`, or by the home chain
 * when `global` is set, and prints them as an aligned table. Throws when the chain does not declare a usable source.
 */
export async function libraryListCommand(
  options: { global: boolean },
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
  const seen = new Set<string>();
  for (const [precedence, root] of roots.entries()) {
    for (const descriptor of ARTIFACT_DESCRIPTORS) {
      const entries = await descriptor.list(root.dir);
      for (const entry of entries) {
        const key = `${descriptor.type}:${entry.slug}`;
        rows.push({ ...entry, type: descriptor.type, source: root.name, precedence, isShadowed: seen.has(key) });
        seen.add(key);
      }
    }
  }

  console.info(renderLibraryTable(rows, resolveTerminalWidth(), readOutputStyle('stdout')));
}

/** Prints usage information for the `library` command. */
export function printLibraryUsage(): void {
  console.info(`Usage: codeassembly library <subcommand> [options]

Subcommands:
  list   List the artifacts (rulebooks, skills, subagents, collections) of every declared source

Options:
  --global   List the sources declared by the home chain (~/.agents/codeassembly.yaml) instead of the project's`);
}

/**
 * Renders rows as an aligned table, sorted by type, then slug, then source precedence: type (the type's glyph in
 * `style`, then its label), slug, source (followed by `(shadowed)` on a shadowed row), delivery, then a
 * hanging-indent-wrapped description. `width` bounds the description column; the others size to their content. Pure
 * and deterministic for a given (rows, width, style).
 */
export function renderLibraryTable(rows: ReadonlyArray<LibraryRow>, width: number, style: OutputStyle): string {
  const sorted = rows.toSorted(compareRows);
  const glyphs = TYPE_GLYPHS[style];

  const typeColWidth = Math.max(
    HEADERS.type.length,
    ...sorted.map((row) => measureTypeCell(glyphs[row.type], row.type)),
  );
  const slugColWidth = Math.max(HEADERS.slug.length, ...sorted.map((row) => row.slug.length));
  const sourceColWidth = Math.max(HEADERS.source.length, ...sorted.map((row) => formatSourceCell(row).length));
  const deliveryColWidth = Math.max(HEADERS.delivery.length, ...sorted.map((row) => row.delivery.length));
  const prefixWidth =
    typeColWidth + COLUMN_GAP + slugColWidth + COLUMN_GAP + sourceColWidth + COLUMN_GAP + deliveryColWidth + COLUMN_GAP;
  const descriptionWidth = Math.max(MIN_DESCRIPTION_WIDTH, width - prefixWidth);

  const gap = ' '.repeat(COLUMN_GAP);
  const indent = ' '.repeat(prefixWidth);

  const headerPrefix =
    HEADERS.type.padEnd(typeColWidth) +
    gap +
    HEADERS.slug.padEnd(slugColWidth) +
    gap +
    HEADERS.source.padEnd(sourceColWidth) +
    gap +
    HEADERS.delivery.padEnd(deliveryColWidth) +
    gap;
  const lines: Array<string> = [(headerPrefix + HEADERS.description).trimEnd()];

  for (const row of sorted) {
    const prefix =
      padType(glyphs[row.type], row.type, typeColWidth) +
      gap +
      row.slug.padEnd(slugColWidth) +
      gap +
      formatSourceCell(row).padEnd(sourceColWidth) +
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

/** Runs `build` to produce an artifact entry, warning to stderr and skipping it if it throws. */
function buildEntryOrSkip(type: ArtifactType, source: string, build: () => ArtifactEntry): ArtifactEntry | undefined {
  try {
    return build();
  } catch (error) {
    warnSkipped(type, source, error);
    return undefined;
  }
}

/** Orders rows by artifact type, then by slug, then by source precedence. */
function compareRows(a: LibraryRow, b: LibraryRow): number {
  if (a.type !== b.type) {
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  }
  return a.slug.localeCompare(b.slug) || a.precedence - b.precedence;
}

/** Builds a row's source cell: the source name, followed by `(shadowed)` when a higher-precedence source ships it. */
function formatSourceCell(row: LibraryRow): string {
  return row.isShadowed ? `${row.source} (shadowed)` : row.source;
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
        delivery: NO_DELIVERY_MODE,
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
        delivery: NO_DELIVERY_MODE,
        description: meta.description ?? '',
      };
    });
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Measures a type cell in display cells: the glyph and a separating space when the glyph is visible, then the label. */
function measureTypeCell(glyph: Glyph, label: string): number {
  return (glyph.width === 0 ? 0 : glyph.width + 1) + label.length;
}

/** Builds a type cell (`{glyph} {label}`, or the label alone for an empty glyph) padded to `colWidth` display cells. */
function padType(glyph: Glyph, label: string, colWidth: number): string {
  const cell = glyph.width === 0 ? label : `${glyph.text} ${label}`;
  return cell + ' '.repeat(Math.max(0, colWidth - measureTypeCell(glyph, label)));
}

/**
 * Reads a skill's `supported-harnesses:` frontmatter for the delivery column, formatting it as the comma-joined
 * harness list that a skill targets, or `—` when the field is absent or empty (meaning all harnesses). Display-only
 * and tolerant: A non-string entry is dropped rather than rejected.
 */
function readHarnessAffinity(content: string): string {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  const declared = isRecord(parsed) ? parsed[SUPPORTED_HARNESSES_KEY] : undefined;
  if (declared === undefined || declared === null) {
    return NO_DELIVERY_MODE;
  }
  const values = Array.isArray(declared) ? declared : [declared];
  const harnesses = values.filter((value): value is string => typeof value === 'string');
  return harnesses.length === 0 ? NO_DELIVERY_MODE : harnesses.join(', ');
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
  const reason = describeError(error);
  printLine({ glyph: 'warning', indent: 2, level: 'warn', text: `Skipping ${type} ${file}: ${reason}` });
}

/** Greedily wraps `text` into lines no wider than `width`; a word longer than `width` overflows on its own line. */
function wrapText(text: string, width: number): Array<string> {
  const lines: Array<string> = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (word === '') continue;
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
