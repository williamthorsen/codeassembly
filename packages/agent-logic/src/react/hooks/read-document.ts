import type { StoredFileRead } from '@williamthorsen/toolbelt.text-file-store/proposed';

import type { Example } from '../../examples/examples.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import { validateConfig } from '../../schema/validate-config.ts';
import { describeLoaded, describeNotLoaded } from './describe-load-outcome.ts';
import {
  type ChartDocument,
  type DocumentReport,
  isChartDocument,
  type LoadFailure,
  type OpenDocument,
  type OtherDocument,
  type OtherKindHandlers,
} from './document-types.ts';
import { findExampleInSearch } from './example-location.ts';
import { findFileInSearch, isVisualizationsSearch } from './file-location.ts';
import { labelSource, type LoadOrigin } from './label-source.ts';
import { parseConfigText, type TextOrigin } from './parse-config-text.ts';

/** Returns the document of a stored agent-logic file. */
export function buildChartDocument(fileName: string, config: AgentLogicConfig, key: number): ChartDocument {
  const label = labelSource({ kind: 'file', fileName });
  return { ...label, kind: 'chart', key, name: fileName, origin: 'File', fileName, config };
}

/** Returns the announcement of a document that opened: a chart's description, or that of the app's own kind. */
export function describeDocument<TOther extends OtherDocument = never>(
  document: OpenDocument<TOther>,
  otherKind?: OtherKindHandlers<TOther>,
): string {
  if (isChartDocument(document)) return describeLoaded(document.source, document.config);
  return otherKind === undefined ? `Opened ${document.name}.` : otherKind.describe(document);
}

/** Returns the announcement of a report: its problems when the page read the document, or its message. */
export function describeReport(report: DocumentReport): string {
  return report.source === undefined
    ? `${report.title}: ${report.message ?? ''}`
    : describeNotLoaded(report.source, report.problems);
}

/** Returns the announcement of what the document region now shows, or `undefined` for the start page. */
export function describeShown<TOther extends OtherDocument = never>(
  { document, report, view }: Shown<TOther>,
  otherKind?: OtherKindHandlers<TOther>,
): string | undefined {
  if (view !== undefined) return `Opened ${VISUALIZATIONS_TITLE}.`;
  return document === undefined ? report && describeReport(report) : describeDocument(document, otherKind);
}

/** Reports whether nothing is shown, which is the start page. */
export function isStartPageShown<TOther extends OtherDocument>({
  document,
  report,
  opening,
  view,
}: Shown<TOther>): boolean {
  return document === undefined && report === undefined && opening === undefined && view === undefined;
}

/** Returns the config that the text parses and validates to, with its parsed value, or why it did not load. */
export function readConfigText(
  text: string,
  origin: TextOrigin,
): { ok: true; config: AgentLogicConfig; value: unknown } | { ok: false; failure: LoadFailure } {
  const read = parseConfigText(text, origin);
  if (!read.ok)
    return { ok: false, failure: { kind: read.isNotJson ? 'not-json' : 'syntax', problems: read.problems } };
  const result = validateConfig(read.value);
  return result.ok
    ? { ok: true, config: result.config, value: read.value }
    : { ok: false, failure: { kind: 'invalid', problems: result.problems } };
}

/** Returns what the page shows for an example, or the start page when there is none. */
export function readExample(example: Example | undefined, key: number): Shown {
  if (example === undefined) return {};
  const origin: LoadOrigin = { kind: 'example', name: example.name, slug: example.slug };
  const label = labelSource(origin);
  const result = validateConfig(example.value);
  return result.ok
    ? {
        document: {
          ...label,
          kind: 'chart',
          key,
          name: example.name,
          origin: 'Example',
          slug: example.slug,
          config: result.config,
        },
      }
    : { report: { title: 'Example not loaded', source: label.source, problems: result.problems } };
}

/**
 * Returns what the page shows first for its URL: the Visualizations table, a stored file to read, an example, or the
 * start page.
 */
export function readLocation(key: number): Shown {
  if (isVisualizationsSearch(globalThis.location.search)) return { view: 'visualizations' };
  const fileName = findFileInSearch(globalThis.location.search);
  return fileName === undefined
    ? readExample(findExampleInSearch(globalThis.location.search), key)
    : { opening: fileName };
}

/**
 * Returns what the page shows for a stored file's read: its document, as the app's own kind when `otherKind` reads it
 * as one and as a chart otherwise, or a report on why it did not open.
 */
export function readStoredFile<TOther extends OtherDocument = never>(
  name: string,
  read: StoredFileRead,
  key: number,
  otherKind?: OtherKindHandlers<TOther>,
): Shown<TOther> {
  if (!read.ok) {
    return {
      report:
        read.reason === 'missing'
          ? {
              title: 'File not found',
              message: `The store does not hold ${name}. Choose a file under Recents.`,
              problems: [],
            }
          : { title: 'File not opened', message: read.message, problems: [] },
    };
  }
  const other = otherKind?.read(name, read.text, key);
  if (other !== undefined) return { document: other };
  const parsed = readConfigText(read.text, 'file');
  if (parsed.ok) return { document: buildChartDocument(name, parsed.config, key) };
  const { source } = labelSource({ kind: 'file', fileName: name });
  return { report: { title: 'File not loaded', source, problems: parsed.failure.problems } };
}

/**
 * What the document region shows: a document, a report on a document that did not open, the stored file being read,
 * the Visualizations table, or none of them, which is the start page.
 */
export interface Shown<TOther extends OtherDocument = never> {
  document?: OpenDocument<TOther> | undefined;
  report?: DocumentReport | undefined;
  opening?: string | undefined;
  view?: 'visualizations' | undefined;
}

/** The heading of the Visualizations table, which also names it in the tab title and the announcement. */
export const VISUALIZATIONS_TITLE = 'All visualizations';
