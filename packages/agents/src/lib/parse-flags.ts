// Shared argv scanner for the kb command-line helpers.
//
// Every kb helper hand-rolled the same value-flag scan: match `--flag` / `--flag=value`, then resolve the value either
// inline or from the next token. This module is the single owner of that mechanic. It deliberately stops at matching and
// value resolution — which flags are required, how often one may appear, whether two are mutually exclusive, and whether
// an empty value is meaningful are all per-command rules each helper composes from the scan result.

// `Name` is the union of canonical flag names. It defaults to `string`, but a command that types its specs with a
// literal-name union (e.g. an operation-name union) gets matched flags reported under that union, so it can switch on
// the name exhaustively without a cast.

/** A flag the scanner recognizes: its canonical name, optional alternate spellings, and whether it consumes a value. */
export interface FlagSpec<Name extends string = string> {
  /** Canonical flag name without the leading `--` (e.g. `store`). Matched flags are reported under this name. */
  name: Name;
  /** Alternate spellings, also without the leading `--` (e.g. `kb` as an alias for `store`). */
  aliases?: readonly string[];
  /** Whether the flag consumes a value. A boolean flag (`false`) is reported with a `null` value. */
  takesValue: boolean;
}

/** One matched flag, reported under its canonical `name` regardless of which spelling appeared in argv. */
export interface MatchedFlag<Name extends string = string> {
  name: Name;
  /** The resolved value for a value-bearing flag, or `null` for a boolean flag. */
  value: string | null;
}

/** The scanner's output: positional arguments in order, and matched flags in encounter order. */
export interface ScanResult<Name extends string = string> {
  positionals: string[];
  flags: MatchedFlag<Name>[];
}

/**
 * Scans `argv` into positionals and recognized flags, resolving each value-bearing flag's value.
 *
 * Matching: a token equal to `--name` (or an alias) matches with no inline value; a token `--name=value` matches and
 * binds `value` inline. The inline form binds **verbatim** — an empty or `--`-prefixed value is accepted, because the
 * `=` already disambiguates the value from a following flag. A value-bearing flag with no inline value consumes the next
 * token, which is rejected when it is absent or itself begins with `--`.
 *
 * The scanner owns matching and value resolution only. It does not enforce which flags are required, how many times one
 * may appear, mutual exclusivity, or whether an empty value is meaningful — each command composes those from the result.
 * Flags are returned in encounter order so a command can detect duplicates or mutually exclusive selections.
 *
 * Throws on an unknown `--`-prefixed token, a value-bearing flag missing its value, or a boolean flag given an inline
 * `=value`.
 */
export function scanFlags<Name extends string = string>(
  argv: readonly string[],
  specs: readonly FlagSpec<Name>[],
): ScanResult<Name> {
  const positionals: string[] = [];
  const flags: MatchedFlag<Name>[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const matched = matchFlag(arg, specs);
    if (matched === null) {
      throw new Error(`unknown flag: ${arg}`);
    }
    const { spec, inlineValue } = matched;

    if (!spec.takesValue) {
      if (inlineValue !== null) {
        throw new Error(`--${spec.name} does not take a value`);
      }
      flags.push({ name: spec.name, value: null });
      continue;
    }

    if (inlineValue !== null) {
      flags.push({ name: spec.name, value: inlineValue });
      continue;
    }

    const next = argv[index + 1] ?? null;
    if (next === null || next.startsWith('--')) {
      throw new Error(`--${spec.name} requires a value`);
    }
    flags.push({ name: spec.name, value: next });
    index += 1;
  }

  return { positionals, flags };
}

/**
 * Reduces matched flags to a last-wins map of value-bearing flags, keyed by canonical name; boolean flags are dropped.
 * A command that allows a flag at most once reads each key directly, and a repeated flag keeps its last occurrence —
 * the same last-wins behavior the hand-rolled scanners had. A command that must reject duplicates inspects
 * {@link ScanResult.flags} directly instead.
 */
export function valueFlagMap(flags: readonly MatchedFlag[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { name, value } of flags) {
    if (value !== null) {
      map[name] = value;
    }
  }
  return map;
}

// region | Helpers

/** Matches a token against the flag specs, returning the spec and any inline `=value`; `null` when no spec matches. */
function matchFlag<Name extends string>(
  arg: string,
  specs: readonly FlagSpec<Name>[],
): { spec: FlagSpec<Name>; inlineValue: string | null } | null {
  for (const spec of specs) {
    for (const name of [spec.name, ...(spec.aliases ?? [])]) {
      const flag = `--${name}`;
      if (arg === flag) {
        return { spec, inlineValue: null };
      }
      if (arg.startsWith(`${flag}=`)) {
        return { spec, inlineValue: arg.slice(flag.length + 1) };
      }
    }
  }
  return null;
}

// endregion | Helpers
