// Tolerant reader for the event store: one JSONL line to an envelope, returning `null` for input that does not fit,
// never throwing. The store is append-only telemetry written by concurrent emitters, so a reader must survive a torn
// line, a foreign file, or a shape from a newer writer. File discovery and reading stay with the caller.

import type { EventEnvelope } from './envelope.ts';

/**
 * Parses one JSONL line into an envelope, or `null` when the line is not one: malformed JSON, a non-object, or an
 * object missing any of the envelope's required `id`, `ts`, `type`, and `cwd` strings. A missing or non-object
 * `payload` becomes `{}`. An undeclared `type` is a valid envelope; the vocabulary is not consulted.
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

// region | Helpers

/** True when `value` is a plain object, narrowing it for keyed access. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// endregion | Helpers
