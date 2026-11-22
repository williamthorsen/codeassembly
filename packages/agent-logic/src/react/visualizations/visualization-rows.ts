import type { StoredFileEntry } from '@williamthorsen/toolbelt.text-file-store/proposed';

import type { Example } from '../../examples/examples.ts';
import { buildExampleSearch } from '../hooks/example-location.ts';
import { buildFileSearch } from '../hooks/file-location.ts';
import { nameStoredFile } from './stored-file-name.ts';

/**
 * Returns the Visualizations table's rows in its default order: the stored files as the store lists them, then the
 * examples. A stored file is a chart named by `nameStoredFile` unless `readKind` gives it a kind of the app's own.
 */
export function buildVisualizationRows<TKind extends string = never>(
  storedFiles: StoredFileEntry[],
  examples: Example[],
  options: VisualizationRowOptions<TKind> = {},
): Array<VisualizationRow<TKind>> {
  return [
    ...storedFiles.map(({ name, modifiedAt }): VisualizationRow<TKind> => {
      const other = options.readKind?.(name);
      return {
        key: `file:${name}`,
        name: other?.name ?? nameStoredFile(name),
        kind: other?.kind ?? 'chart',
        file: name,
        modifiedAt,
        href: buildFileSearch(name),
        target: { kind: 'file', name },
      };
    }),
    ...examples.map((example): VisualizationRow<TKind> => ({
      key: `example:${example.slug}`,
      name: example.name,
      kind: 'chart',
      file: undefined,
      modifiedAt: undefined,
      href: buildExampleSearch(example),
      target: { kind: 'example', example },
    })),
  ];
}

/**
 * Returns the rows sorted by the column, or in their given order without a sort. A row without a file or a modification
 * time sorts after every row that has one, in either direction, and rows of equal value keep their given order. The
 * `kind` column sorts by the text that `labelKind` returns, which is the kind itself by default.
 */
export function sortVisualizationRows<TKind extends string = never>(
  rows: Array<VisualizationRow<TKind>>,
  sort: VisualizationSort | undefined,
  options: VisualizationSortOptions<TKind> = {},
): Array<VisualizationRow<TKind>> {
  if (sort === undefined) return rows;
  const labelKind = options.labelKind ?? ((kind: 'chart' | TKind) => kind);
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return rows.toSorted((a, b) => {
    const first = readSortValue(a, sort.column, labelKind);
    const second = readSortValue(b, sort.column, labelKind);
    if (first === undefined || second === undefined) return compareMissing(first, second);
    // ISO 8601 times sort as plain text, which a locale's collation may reorder by ignoring punctuation.
    return sign * (sort.column === 'modified' ? compareCodeUnits(first, second) : first.localeCompare(second));
  });
}

/** A stored file of a kind that the app defines, with the name that its row shows. */
export interface StoredFileKind<TKind extends string> {
  kind: TKind;
  name: string;
}

/** A column by which the Visualizations table sorts. */
export type VisualizationColumn = 'file' | 'kind' | 'modified' | 'name';

/** A row of the Visualizations table; an example's has neither a file nor a modification time. */
export interface VisualizationRow<TKind extends string = never> {
  key: string;
  name: string;
  kind: 'chart' | TKind;
  file: string | undefined;
  modifiedAt: string | undefined;
  href: string;
  /** What the row opens. */
  target: { kind: 'example'; example: Example } | { kind: 'file'; name: string };
}

export interface VisualizationRowOptions<TKind extends string> {
  /** Returns the kind and name of a stored file of a kind that the app defines, or `undefined` for a chart. */
  readKind?: ((fileName: string) => StoredFileKind<TKind> | undefined) | undefined;
}

/** A sort of the Visualizations table by one column. */
export interface VisualizationSort {
  column: VisualizationColumn;
  direction: 'ascending' | 'descending';
}

export interface VisualizationSortOptions<TKind extends string> {
  /** Returns the text that the Kind column shows for a kind. */
  labelKind?: ((kind: 'chart' | TKind) => string) | undefined;
}

// region | Helpers
/** Orders two strings by their code units. */
function compareCodeUnits(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** Orders a missing value after a present one, and keeps two values of the same presence in place. */
function compareMissing(first: string | undefined, second: string | undefined): number {
  if (first === second) return 0;
  return first === undefined ? 1 : -1;
}

/** Returns the text by which the row sorts under the column. */
function readSortValue<TKind extends string>(
  row: VisualizationRow<TKind>,
  column: VisualizationColumn,
  labelKind: (kind: 'chart' | TKind) => string,
): string | undefined {
  switch (column) {
    case 'file':
      return row.file;
    case 'kind':
      return labelKind(row.kind);
    case 'modified':
      return row.modifiedAt;
    case 'name':
      return row.name;
  }
}
// endregion | Helpers
