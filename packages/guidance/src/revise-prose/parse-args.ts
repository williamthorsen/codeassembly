import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { DEFAULT_BATCH_BUDGET } from './batch.ts';
import { RULE_NAME_PATTERN, SWEEP_VERSION_PATTERN } from './parse-record.ts';
import type { NamedRule, ParsedArgs } from './types.ts';

/** The flags recognized by the sweep. Each of `rule` and `unit` may repeat; the scanner reports them in argv order. */
const FLAG_SPECS: ReadonlyArray<FlagSpec<'batch-budget' | 'rule' | 'unit'>> = [
  { name: 'batch-budget', takesValue: true },
  { name: 'rule', takesValue: true },
  { name: 'unit', takesValue: true },
];

/**
 * Parses the helper's argv: positional paths narrowing the sweep, plus the rules and units that the caller names.
 *
 * `--rule <name>@<version>=<unit>` names a rule, its sweep version, and the unit owning it, whether or not the helper
 * has a detector for it; `--rule <name>=<unit>` names a rule that does not declare a sweep version, which is swept but
 * never recorded. `--unit <name>=<version>` names a unit in force and the version it is at. Both repeat.
 * `--batch-budget <bytes>` overrides the default ceiling.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanFlags(argv, FLAG_SPECS);

  const units = new Map<string, string>();
  const rules: NamedRule[] = [];
  let budget = DEFAULT_BATCH_BUDGET;

  for (const flag of scanned.flags) {
    const value = flag.value ?? '';
    if (flag.name === 'batch-budget') {
      budget = Number(value);
      if (!Number.isSafeInteger(budget) || budget <= 0) {
        throw new Error(`--batch-budget must be a positive integer, got "${value}"`);
      }
      continue;
    }

    const [name, rest] = splitPair(flag.name, value);
    if (flag.name === 'unit') {
      units.set(name, rest);
      continue;
    }
    const [rule, version] = splitVersion(name);
    if (!RULE_NAME_PATTERN.test(rule)) {
      throw new Error(`rule "${rule}" is not a lowercase kebab-case name`);
    }
    if (version !== undefined && !SWEEP_VERSION_PATTERN.test(version)) {
      throw new Error(`rule "${rule}" names sweep version "${version}", which is not a positive integer`);
    }
    const owner = rules.find((named) => named.rule === rule);
    if (owner !== undefined) {
      throw new Error(`rule "${rule}" is named twice, under units "${owner.unit}" and "${rest}"; a rule has one unit`);
    }
    rules.push({ rule, unit: rest, version });
  }

  for (const named of rules) {
    if (!units.has(named.unit)) {
      throw new Error(`rule "${named.rule}" names unit "${named.unit}", which is not declared by any --unit`);
    }
  }

  return { paths: scanned.positionals, rules, units, budget };
}

/** Drops a leading `detect` verb, so the command form and the bare path form parse alike. */
export function stripCommand(argv: readonly string[]): readonly string[] {
  return argv[0] === 'detect' ? argv.slice(1) : argv;
}

// region | Helpers

/**
 * Splits a `name=value` flag argument. Both halves must be non-empty, because an empty unit name or version does not
 * name anything on which the record could key.
 */
function splitPair(flag: string, value: string): [string, string] {
  const cut = value.indexOf('=');
  const name = cut === -1 ? '' : value.slice(0, cut);
  const rest = cut === -1 ? '' : value.slice(cut + 1);
  if (name === '' || rest === '') {
    throw new Error(`--${flag} takes <name>=<value>, got "${value}"`);
  }
  return [name, rest];
}

/** Splits a rule flag's name into the rule and the sweep version after its first `@`, if it names one. */
function splitVersion(name: string): [string, string | undefined] {
  const cut = name.indexOf('@');
  return cut === -1 ? [name, undefined] : [name.slice(0, cut), name.slice(cut + 1)];
}

// endregion | Helpers
