// Shapes for the capture-lede-decision helper: the verdict an author records, the resolved decision episode, and the
// JSON payloads emitted to stdout.
//
// The stdout payload is a discriminated union on `ok`, mirroring `capture-event`. Recoverable failures (an unresolvable
// artifact, an unreachable store on the recording path, schema validation, invalid args) return
// `{ ok: false, error, message }`; system errors (out-of-disk, permission denied) print to stderr and exit non-zero.

/** The verdicts an author may record, in the order the skill presents them. */
export const LEDE_VERDICTS = ['accepted', 'revised'] as const;

/** An author's decision about a lede: the agent's text shipped as written, or it was rewritten before merge. */
export type LedeVerdict = (typeof LEDE_VERDICTS)[number];

// A widened-element set for membership tests: the `as const` tuple's literal element type rejects a `string` argument
// to `.includes`, and type assertions are banned, so the set's `.has(string)` is the assertion-free lookup.
const VERDICT_SET: ReadonlySet<string> = new Set(LEDE_VERDICTS);

/** Reports whether a value is one of the declared {@link LEDE_VERDICTS}. */
export function isLedeVerdict(value: unknown): value is LedeVerdict {
  return typeof value === 'string' && VERDICT_SET.has(value);
}

/** The change a decision describes, resolved from caller flags with change-summary frontmatter as the fallback. */
export interface EpisodeIdentity {
  type: string;
  tier: string;
  scope: string;
  pr: string;
  mergeCommit: string;
  /** Ticket the change served; absent for a branch that carried none. */
  ticket?: string;
}

/** A resolved decision episode: both ledes, whether they differ, the change's identity, and the doctrine in force. */
export interface LedeEpisode {
  /** The `## What` the agent published to the pull request. */
  agentLede: string;
  /** The lede that reached the merge commit. */
  mergedLede: string;
  /** Whether the ledes differ once whitespace is normalized, so a reflow alone does not read as a revision. */
  differ: boolean;
  identity: EpisodeIdentity;
  /** `sha256:`-prefixed digest of the doctrine file that governed the agent's lede. */
  doctrineHash: string;
  /** Installed agents-package version; absent when the install manifest is unreadable. */
  agentsVersion?: string;
}

/** The outcome of resolving an episode: the episode, or the categorical reason it could not be assembled. */
export type ResolveEpisodeOutcome =
  { ok: true; episode: LedeEpisode } | { ok: false; error: EpisodeErrorCode; message: string };

/**
 * Categorical reasons an episode cannot be resolved, each naming a distinct missing input. `unresolved-identity` covers
 * every field of {@link EpisodeIdentity} under one code, with the message naming the field that failed: the caller's
 * recourse is the same in each case — supply the flag — so splitting it per field would buy the caller nothing.
 */
export type EpisodeErrorCode =
  'no-artifact-dir' | 'no-agent-lede' | 'no-merged-lede' | 'no-doctrine' | 'unresolved-identity';

/**
 * The store a decision would record into, as seen from inspect mode: reachable, or the categorical reason a record
 * could not be written to it. Reported rather than raised, so a caller learns the decision cannot be kept before it
 * asks the author to make one.
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
  verdict: LedeVerdict;
  /** The generated ULID, which is also the record's filename stem. */
  id: string;
  capturedAt: string;
  path: string;
  /** Registry name of the store the record was written to. */
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

/** Every categorical error code the helper can return without an unexpected throw. */
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
