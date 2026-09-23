// Shapes for the capture-lede-decision helper: the rating recorded by an author, the resolved decision episode, and
// the JSON payloads emitted to stdout.
//
// The stdout payload is a discriminated union on `ok`, mirroring `capture-event`. Recoverable failures (an unresolvable
// artifact, an unreachable store on the recording path, schema validation, invalid args) return
// `{ ok: false, error, message }`; system errors (out-of-disk, permission denied) print to stderr and exit non-zero.

import type { LedeQuality } from '../lede-corpus/lede-quality.ts';

/** The verdicts that a record can name, derived from whether the two ledes differ rather than supplied by a caller. */
export const LEDE_VERDICTS = ['accepted', 'revised'] as const;

/** What became of the agent's lede: It merged as written, or it was rewritten before merge. */
export type LedeVerdict = (typeof LEDE_VERDICTS)[number];

/** The change described by a decision, resolved wholly from caller flags or wholly from change-summary frontmatter. */
export interface EpisodeIdentity {
  type: string;
  tier: string;
  /** Whether the work type had the breaking marker. */
  breaking: boolean;
  /** Scope to which the change belongs; absent for a change that names none. */
  scope?: string;
  pr: string;
  mergeCommit: string;
  /** Ticket served by the change; absent for a branch that names none. */
  ticket?: string;
}

/** A resolved decision episode: both ledes, whether they differ, the change's identity, and the doctrine in force. */
export interface LedeEpisode {
  /** The `## What` that the agent published to the pull request. */
  agentLede: string;
  /** The lede in the merge commit. */
  mergedLede: string;
  /** Whether the ledes differ once whitespace is normalized, so a reflow alone does not read as a revision. */
  differ: boolean;
  identity: EpisodeIdentity;
  /** `sha256:`-prefixed digest of the doctrine file that governed the agent's lede. */
  doctrineHash: string;
  /** Installed agents-package version; absent when the home-provenance stamp is unreadable. */
  agentsVersion?: string;
}

/** The outcome of resolving an episode: the episode, or the categorical reason it could not be assembled. */
export type ResolveEpisodeOutcome =
  { ok: true; episode: LedeEpisode } | { ok: false; error: EpisodeErrorCode; message: string };

/**
 * Categorical reasons an episode cannot be resolved, each naming a distinct missing input. `unresolved-identity` covers
 * every field of {@link EpisodeIdentity} under one code, with the message naming the field that failed: The caller's
 * recourse is the same in each case (supply the flag), so splitting it per field would buy the caller nothing.
 *
 * An unreadable taxonomy is `no-taxonomy` rather than `unresolved-identity`, because no `--type` value resolves against
 * a taxonomy that did not load: The caller's recourse is to repair the install, as it is for `no-doctrine`.
 */
export type EpisodeErrorCode =
  'no-artifact-dir' | 'no-agent-lede' | 'no-merged-lede' | 'no-doctrine' | 'no-taxonomy' | 'unresolved-identity';

/**
 * The store into which a decision would record, as seen from inspect mode: reachable, or the categorical reason a
 * record could not be written to it. Reported rather than raised, so that a caller learns the decision cannot be kept
 * before it asks the author to make one.
 */
export type InspectedStore =
  { name: string; reachable: true } | { name: string; reachable: false; error: DecisionErrorCode; message: string };

/** The stdout payload for `--inspect`: the resolved episode and its destination store, with nothing written. */
export interface InspectSuccess {
  ok: true;
  mode: 'inspect';
  episode: LedeEpisode;
  store: InspectedStore;
}

/** The stdout payload for a recorded decision. */
export interface CommitSuccess {
  ok: true;
  mode: 'commit';
  /** The author's rating of the lede in the merged pull request. */
  quality: LedeQuality;
  /** Derived from whether the ledes differ, so it always agrees with the sections that the record contains. */
  verdict: LedeVerdict;
  /** The generated ULID, which is also the record's filename stem. */
  id: string;
  capturedAt: string;
  path: string;
  /** Registry name of the store to which the record was written. */
  store: string;
}

/** The stdout payload on a recoverable failure. */
export interface DecisionFailure {
  ok: false;
  error: DecisionErrorCode;
  message: string;
  /** Validation errors, set when `error: 'schema-validation'`. */
  errors?: string[];
}

/** Every categorical error code that the helper can return without an unexpected throw. */
export type DecisionErrorCode =
  | EpisodeErrorCode
  | 'invalid-args'
  | 'missing-store'
  | 'store-not-registered'
  | 'readonly-store'
  | 'no-default-store'
  | 'schema-validation';

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type DecisionResult = InspectSuccess | CommitSuccess | DecisionFailure;
