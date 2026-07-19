// Tolerant readers for the event store: one JSONL line to an envelope, one relative file path to lane and session
// identity. Both return `null` for input that does not fit, never throw: the store is append-only telemetry written by
// concurrent emitters, so a reader must survive a torn line, a foreign file, or a shape from a newer writer.
//
// File discovery and reading stay with the caller; these helpers exist so the path layout and the envelope's minimum
// shape are interpreted in one place, next to the vocabulary they belong to.

import type { EventEnvelope } from './envelope.ts';

/**
 * Lane and session identity carried by an event file's path within the events root:
 * `{owner}/{name}/{sanitized-branch}/{session}.jsonl`.
 *
 * Segments are reported as spelled on disk, placeholders (`_no-repo`, `_no-branch`, `_no-session`) included: the
 * writer's placeholder is a real lane a watching surface may still want to render.
 */
export interface LanePath {
  /** `owner/name` repo key. */
  repo: string;
  /** Sanitized branch name — the lane key within the repo. */
  branch: string;
  /** Session id — the file's basename without its extension. */
  session: string;
}

/**
 * Parses one JSONL line into an envelope, or `null` when the line is not one: malformed JSON, a non-object, or an
 * object missing any of the envelope's required `id`, `ts`, `type`, and `cwd` strings. A missing or non-object
 * `payload` becomes `{}`, matching what the writer emits when the caller supplies none.
 *
 * The declared vocabulary is deliberately not consulted: an undeclared `type` is a valid envelope by the envelope's
 * own contract.
 */
export function parseEventLine(line: string): EventEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const { id, ts, type, cwd } = parsed;
  if (typeof id !== 'string' || typeof ts !== 'string' || typeof type !== 'string' || typeof cwd !== 'string') {
    return null;
  }

  return {
    id,
    ts,
    type,
    ...(typeof parsed.repo === 'string' && { repo: parsed.repo }),
    ...(typeof parsed.branch === 'string' && { branch: parsed.branch }),
    ...(typeof parsed.session === 'string' && { session: parsed.session }),
    cwd,
    ...(typeof parsed.harness === 'string' && { harness: parsed.harness }),
    payload: isRecord(parsed.payload) ? parsed.payload : {},
  };
}

/**
 * Parses an event file's path, relative to the events root, into lane and session identity — or `null` when the path
 * is not an `owner/name/branch/session.jsonl` leaf. Accepts both `/` and `\` separators, so directory-walk output
 * parses identically on every platform.
 */
export function parseLanePath(relativePath: string): LanePath | null {
  const segments = relativePath.split(/[/\\]/);
  const [owner, name, branch, file] = segments;
  if (
    segments.length !== 4 ||
    owner === undefined ||
    name === undefined ||
    branch === undefined ||
    file === undefined
  ) {
    return null;
  }
  if (!file.endsWith('.jsonl')) {
    return null;
  }

  const session = file.slice(0, -'.jsonl'.length);
  if (owner === '' || name === '' || branch === '' || session === '') {
    return null;
  }
  return { repo: `${owner}/${name}`, branch, session };
}

// region | Helpers

/** True when `value` is a plain object, narrowing it for keyed access. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// endregion | Helpers
