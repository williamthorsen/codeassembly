/** One registration of a prototype; a re-registered slug adds an entry with the next version. */
export interface ManifestEntry {
  slug: string;
  /** The prototype's number in the set, shared by every version of its slug. */
  number: number;
  version: number;
  /** ISO-8601 UTC timestamp of the registration. */
  registeredAt: string;
  title: string;
  /** The published artifact's URL. */
  url: string;
  /** Path of the prototype's source file, as the caller gave it. */
  source: string | null;
  lens: string | null;
  inputs: string[];
  description: string | null;
  /** Labelled facts to compare across the set, in display order. */
  notes: Note[];
  /** Path of the stored screenshot, relative to the set directory. */
  shot: string | null;
}

/** The id that the next registration of a slug takes, resolved before the prototype is built. */
export interface PrototypeId {
  slug: string;
  number: number;
  version: number;
  /** `{number}.{version}`, the form in which the developer names a version. */
  id: string;
}

/** One labelled fact about a prototype. */
export interface Note {
  label: string;
  value: string;
}

/** What the prototypes of a set share, what the latest round changed, and what to try in each. */
export interface SetSummary {
  shared: string;
  /** What the latest round revised; `null` in the first round. */
  changes: string | null;
  try: string[];
}

/** The `manifest.json` of one prototype set. */
export interface Manifest {
  title: string;
  /** The published index page's URL, once `record-index` has run. */
  indexUrl: string | null;
  summary: SetSummary | null;
  entries: ManifestEntry[];
}

/** Categorical error codes that the helper returns without an unexpected throw. */
export type IndexPrototypesErrorCode =
  | 'invalid-args'
  | 'invalid-manifest'
  | 'invalid-slug'
  | 'invalid-summary'
  | 'invalid-url'
  | 'manifest-not-found'
  | 'missing-set-title'
  | 'not-png'
  | 'number-conflict'
  | 'page-too-large'
  | 'screenshot-not-found'
  | 'summary-not-found';

/** The helper's stdout payload on a recoverable failure. */
export interface IndexPrototypesFailure {
  ok: false;
  error: IndexPrototypesErrorCode;
  message: string;
}

/** The stdout payload of a successful `register`. */
export interface RegisterSuccess {
  ok: true;
  command: 'register';
  manifestPath: string;
  entry: ManifestEntry;
}

/** The stdout payload of `copy-probe`: the probe's source, for the Playwright MCP's `browser_evaluate`. */
export interface CopyProbeSuccess {
  ok: true;
  command: 'copy-probe';
  function: string;
}

/** The stdout payload of a successful `describe-set`. */
export interface DescribeSetSuccess {
  ok: true;
  command: 'describe-set';
  manifestPath: string;
  summary: SetSummary;
}

/** The stdout payload of a successful `record-index`. */
export interface RecordIndexSuccess {
  ok: true;
  command: 'record-index';
  manifestPath: string;
  indexUrl: string;
}

/** The stdout payload of a successful `resolve-ids`: one id per slug given, in the order given. */
export interface ResolveIdsSuccess {
  ok: true;
  command: 'resolve-ids';
  ids: PrototypeId[];
}

/** The stdout payload of a successful `render`. */
export interface RenderSuccess {
  ok: true;
  command: 'render';
  path: string;
  bytes: number;
  cards: number;
  title: string;
  indexUrl: string | null;
  /** Slugs whose recorded screenshot file is missing, rendered with the placeholder. */
  missingShots: string[];
  warning?: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type IndexPrototypesResult =
  | CopyProbeSuccess
  | DescribeSetSuccess
  | IndexPrototypesFailure
  | RecordIndexSuccess
  | RegisterSuccess
  | RenderSuccess
  | ResolveIdsSuccess;
