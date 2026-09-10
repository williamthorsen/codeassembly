import type { ChangeRecord } from './types.ts';

/** Reports whether `name` is one of the declared tokens. */
export function isTokenName(name: string): name is TokenName {
  return DECLARED_TOKENS.has(name);
}

/**
 * Brings a record to the form the rest of the engine assumes: string values trimmed, the `*` scope and every empty
 * value dropped, and a type spelled with the breaking marker split into its bare key and the flag. Idempotent, so a
 * caller may normalize at its own boundary and still pass the result to `render`.
 */
export function normalizeChangeRecord(record: ChangeRecord): ChangeRecord {
  const normalized: ChangeRecord = {};

  const scope = record.scope?.trim();
  if (scope !== undefined && scope !== '' && scope !== SCOPE_WILDCARD) {
    normalized.scope = scope;
  }

  const type = record.type?.trim();
  let breaking = record.breaking === true;
  if (type !== undefined && type !== '') {
    if (type.endsWith(BREAKING_MARKER)) {
      normalized.type = type.slice(0, -BREAKING_MARKER.length);
      breaking = true;
    } else {
      normalized.type = type;
    }
  }
  if (breaking) {
    normalized.breaking = true;
  }

  for (const field of ['prNumber', 'ticketRef', 'title'] as const) {
    const value = record[field]?.trim();
    if (value !== undefined && value !== '') {
      normalized[field] = value;
    }
  }

  return normalized;
}

/** The marker a breaking change carries, whether as its own token or as the tail of a rendered type. */
export const BREAKING_MARKER = '!';

/** The scope standing for a change that spans every workspace. It normalizes to empty and never reaches output. */
export const SCOPE_WILDCARD = '*';

/** The token names a template may reference; any other `{...}` run is literal text. */
export const TOKEN_NAMES = ['breaking', 'pr_number', 'scope', 'ticket_ref', 'title', 'type'] as const;

/** A token name a template may reference. */
export type TokenName = (typeof TOKEN_NAMES)[number];

// region | Helpers

/** The declared names, indexed for membership tests. */
const DECLARED_TOKENS: ReadonlySet<string> = new Set(TOKEN_NAMES);

// endregion | Helpers
