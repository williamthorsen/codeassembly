import { defineGlyphSet, type Glyph, type OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import type { ArtifactType } from '../lib/artifact-types.ts';

/**
 * A listing row: one artifact of a source, with that source's rank in precedence order (0 = highest) and whether a
 * higher-precedence source provides the same `(type, slug)`. `delivery` is undefined for an artifact that doesn't
 * declare a delivery mode.
 */
export interface LibraryRow {
  readonly type: ArtifactType;
  readonly slug: string;
  readonly source: string;
  readonly precedence: number;
  readonly isShadowed: boolean;
  readonly delivery: string | undefined;
  readonly description: string;
}

/** The glyph leading each type's cell; plain output has none, leaving the label alone. */
const TYPE_GLYPHS = defineGlyphSet<ArtifactType>({
  collection: { plain: '', rich: '📦' },
  rulebook: { plain: '', rich: '📕' },
  skill: { plain: '', rich: '🪄' },
  subagent: { plain: '', rich: '🤖' },
});

/** Rank used to group rows by type before the within-type slug sort. */
const TYPE_ORDER: Readonly<Record<ArtifactType, number>> = { rulebook: 0, skill: 1, subagent: 2, collection: 3 };

const NO_DELIVERY_MODE = '—';

const HEADERS = {
  type: 'type',
  slug: 'slug',
  source: 'source',
  delivery: 'delivery',
  description: 'description',
} as const;

const COLUMN_GAP = 2;
/**
 * Floor for the description column so that, on a narrow terminal, the table still wraps the description rather than
 * collapsing the column.
 */
const MIN_DESCRIPTION_WIDTH = 20;

/**
 * Renders rows as an aligned table, sorted by type, then slug, then source precedence: type (the type's glyph in
 * `style`, then its label), slug, source (followed by `(shadowed)` on a shadowed row), delivery (`—` when undeclared),
 * then a hanging-indent-wrapped description. `width` bounds the description column; the others size to their content.
 * Pure and deterministic for a given (rows, width, style).
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
  const deliveryColWidth = Math.max(HEADERS.delivery.length, ...sorted.map((row) => formatDeliveryCell(row).length));
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
      formatDeliveryCell(row).padEnd(deliveryColWidth) +
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

/** Orders rows by artifact type, then by slug, then by source precedence. */
function compareRows(a: LibraryRow, b: LibraryRow): number {
  if (a.type !== b.type) {
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  }
  return a.slug.localeCompare(b.slug) || a.precedence - b.precedence;
}

/** Builds a row's delivery cell: its delivery value, or `—` when the artifact doesn't declare one. */
function formatDeliveryCell(row: LibraryRow): string {
  return row.delivery ?? NO_DELIVERY_MODE;
}

/**
 * Builds a row's source cell: the source name, followed by `(shadowed)` when a higher-precedence source provides it.
 */
function formatSourceCell(row: LibraryRow): string {
  return row.isShadowed ? `${row.source} (shadowed)` : row.source;
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
