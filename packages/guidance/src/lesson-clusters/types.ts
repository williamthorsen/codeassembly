import type { EventImpact } from '@williamthorsen/kb/records';

/** One event as the clusterer reads it: enough to judge its lesson, without the full body. */
export interface InventoryEntry {
  id: string;
  summary: string;
  skill?: string;
  repo?: string;
  capturedAt: string;
  impact?: EventImpact;
  /** The body's first paragraph, cut to the excerpt limit. */
  excerpt: string;
  /** The timestamp of the latest triage artifact that deferred the event; present only on a deferred event. */
  deferredAt?: string;
}

/** An event file that the inventory could not read as an event, with the reason. */
export interface SkippedEvent {
  file: string;
  message: string;
}

/** The events that a clustering pass groups: the open pool, and the events that an earlier triage deferred. */
export interface Inventory {
  store: string;
  pool: InventoryEntry[];
  deferred: InventoryEntry[];
  skipped: SkippedEvent[];
}

/** One group of events that teach the same lesson, as the clusterer returns it. */
export interface MappedCluster {
  id: string;
  lesson: string;
  eventIds: string[];
}

/** The clusterer's output: every inventoried event placed in exactly one cluster. */
export interface ClusterMap {
  clusters: MappedCluster[];
}

/** A defect in a cluster map, reported with every other defect rather than one at a time. */
export interface ClusterViolation {
  code: 'duplicate-cluster-id' | 'duplicate-event' | 'empty-cluster' | 'missing-event' | 'unknown-event';
  message: string;
}

/** The impact ratings of a cluster's events, counted per level. */
export type ImpactCounts = Record<EventImpact | 'unrated', number>;

/** Whether a cluster takes part in a run, or stays out because all of it was deferred recently. */
export type ClusterStatus = 'deferred-active' | 'eligible';

/** The measures on which a cluster is judged, kept separate rather than combined into one score. */
export interface ClusterSignals {
  recurrence: number;
  impact: ImpactCounts;
  firstCapturedAt: string;
  latestCapturedAt: string;
  status: ClusterStatus;
}

/** A validated cluster with its signals. */
export interface SignalledCluster extends MappedCluster {
  signals: ClusterSignals;
}
