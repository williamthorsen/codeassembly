/** One registration of a prototype; a re-registered slug adds an entry with the next version. */
export interface ManifestEntry {
  slug: string;
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
  /** Path of the stored screenshot, relative to the set directory. */
  shot: string | null;
}

/** The `manifest.json` of one prototype set. */
export interface Manifest {
  title: string;
  /** The published index page's URL, once `record-index` has run. */
  indexUrl: string | null;
  entries: ManifestEntry[];
}

/** Categorical error codes that the helper returns without an unexpected throw. */
export type IndexPrototypesErrorCode =
  | 'invalid-args'
  | 'invalid-manifest'
  | 'invalid-slug'
  | 'invalid-url'
  | 'manifest-not-found'
  | 'missing-set-title'
  | 'not-png'
  | 'page-too-large'
  | 'screenshot-not-found';

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

/** The stdout payload of a successful `record-index`. */
export interface RecordIndexSuccess {
  ok: true;
  command: 'record-index';
  manifestPath: string;
  indexUrl: string;
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
export type IndexPrototypesResult = IndexPrototypesFailure | RecordIndexSuccess | RegisterSuccess | RenderSuccess;
