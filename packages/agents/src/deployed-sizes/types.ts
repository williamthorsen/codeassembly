/** Whether a deployed file loads into an agent's context or only sits in the tree beside the ones that do. */
export type DeployedFileKind = 'asset' | 'document';

/** The three totals that a snapshot states, each derived from the measured files. */
export interface SizeAggregates {
  /** Bytes that load into a session before it invokes anything, named by component. */
  readonly alwaysLoaded: AlwaysLoadedAggregate;
  /** Sum of every document's bytes. Overlaps `alwaysLoaded`, which counts each document's description a second time. */
  readonly onInvocation: number;
  /** Sum of every asset's bytes. */
  readonly assets: number;
}

/**
 * The always-loaded total and the three components from which it is summed. A component is named rather than folded
 * in, because each is reduced by different work.
 */
export interface AlwaysLoadedAggregate {
  readonly total: number;
  readonly ambientRegions: number;
  readonly skillDescriptions: number;
  readonly subagentDescriptions: number;
}

/** One measured file: its size in bytes and whether a harness loads it into context. */
export interface DeployedFile {
  readonly bytes: number;
  readonly kind: DeployedFileKind;
}

/**
 * One deployment's whole size vector, keyed by deployed path relative to the harness root. A line states a complete
 * state rather than a change, because the deltas that a report derives compare complete states.
 *
 * `kind` discriminates the line, so that a later marker written into the same record is skipped by a reader of
 * snapshots rather than misread as one.
 */
export interface SizeSnapshot {
  readonly schemaVersion: number;
  readonly kind: 'snapshot';
  readonly recordedAt: string;
  /** Version of the package whose binary deployed. */
  readonly version: string;
  /** Commit that the source tree was on, absent when the source is not a git tree (an npm install has none). */
  readonly sourceCommit?: string | undefined;
  readonly files: Readonly<Record<string, DeployedFile>>;
  readonly aggregates: SizeAggregates;
}
