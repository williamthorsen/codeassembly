import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import type { Problem } from '../../schema/validate-config.ts';
import type { SourceLabel } from './label-source.ts';

/** A config that validated, shown as the document's chart. */
export interface ChartDocument extends SourceLabel {
  kind: 'chart';
  /** Changes with every load, so that the canvas of one load never shows another's chart. */
  key: number;
  /** The example's name or the stored file's name. */
  name: string;
  /** Where the document came from, as a word for the app bar. */
  origin: 'Example' | 'File';
  /** The example's slug, which the sidebar marks as current; absent for any other document. */
  slug?: string | undefined;
  /** The stored file's name, which the sidebar marks as current; absent for an example. */
  fileName?: string | undefined;
  config: AgentLogicConfig;
}

/** An example or a stored file that the page could not open, reported on the start page under its title. */
export interface DocumentReport {
  title: string;
  /** The line that names the document's source, when the page read the document but could not load it. */
  source?: string | undefined;
  /** Why the page could not read the document. */
  message?: string | undefined;
  problems: Problem[];
}

/** Where uploaded text came from: a dropped or picked file, or typed or pasted text. */
export type InputOrigin = { kind: 'file'; fileName: string } | { kind: 'paste' };

/**
 * Why text from a card did not load: text that is not of the card's kind, a stored file that already has the text's
 * name, or a write that the store refused or did not receive.
 */
export type LoadFailure =
  | { kind: 'invalid' | 'not-json' | 'other-kind' | 'store' | 'syntax'; problems: Problem[] }
  | { kind: 'conflict'; name: string; problems: Problem[] };

/** How a card's text is loaded; `replace` overwrites a stored file that has the text's name. */
export interface LoadOptions {
  replace?: boolean | undefined;
}

/** The document that the document region shows: a chart, or a stored document of a kind that the app defines. */
export type OpenDocument<TOther extends OtherDocument = never> = ChartDocument | TOther;

/**
 * A stored document of a kind that the app defines, such as an unconverted prompt. Its `kind` must not be `'chart'`,
 * which `isChartDocument` reads as a chart.
 */
export interface OtherDocument {
  kind: string;
  /** Changes with every load, so that the view of one load never keeps another's state. */
  key: number;
  name: string;
  fileName: string;
}

/** How a page opens and announces stored text of a kind that the app defines. */
export interface OtherKindHandlers<TOther extends OtherDocument> {
  /** Returns the document of a stored file of this kind, or `undefined` for a file to open as a chart. */
  read: (name: string, text: string, key: number) => TOther | undefined;
  /** Returns the announcement of an opened document of this kind. */
  describe: (document: TOther) => string;
}

/** Reports whether the open document is a chart rather than a document of a kind that the app defines. */
export function isChartDocument<TOther extends OtherDocument>(
  document: OpenDocument<TOther>,
): document is ChartDocument {
  return document.kind === 'chart';
}
