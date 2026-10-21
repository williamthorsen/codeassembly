import { BREAKING_MARKER, type ChangeRecord } from '@williamthorsen/change-grammar';

import { type MatchedFlag, valueFlagMap } from '../lib/parse-flags.ts';
import type { RecordOverrides } from './change-record-block.ts';
import type { Subcommand } from './types.ts';

/**
 * Reads the override flags that `render-block` and `resolve-effective-record` share. A blank value does not set an
 * override.
 */
export function readOverrideFlags(flags: readonly MatchedFlag[]): RecordOverrides {
  const values = valueFlagMap(flags);
  const scope = values['override-scope']?.trim();
  const type = readOverrideType(values);
  return {
    ...(flags.some((flag) => flag.name === 'override-breaking') && { breaking: true }),
    ...(scope !== undefined && scope !== '' && { scope }),
    ...(type !== undefined && type !== '' && { type }),
  };
}

/** Reads `--override-type`, refusing a type spelled with the breaking marker. */
export function readOverrideType(values: Record<string, string>): string | undefined {
  const type = values['override-type']?.trim();
  if (type?.endsWith(BREAKING_MARKER) === true) {
    throw new Error('--override-type takes a bare type; pass --override-breaking for a breaking change');
  }
  return type;
}

/** Reads `--project-root`, refusing an empty value. */
export function readProjectRootFlag(flags: readonly MatchedFlag[]): string | undefined {
  const projectRoot = valueFlagMap(flags)['project-root']?.trim();
  if (projectRoot === '') {
    throw new Error('--project-root requires a value');
  }
  return projectRoot;
}

/** Reads the record flags into a record, leaving out every field whose flag is absent. */
export function readRecordFlags(flags: readonly MatchedFlag[]): ChangeRecord {
  const values = valueFlagMap(flags);
  return {
    ...(flags.some((flag) => flag.name === 'breaking') && { breaking: true }),
    ...(values['pr-number'] !== undefined && { prNumber: values['pr-number'] }),
    ...(values['scope'] !== undefined && { scope: values['scope'] }),
    ...(values['ticket-ref'] !== undefined && { ticketRef: values['ticket-ref'] }),
    ...(values['title'] !== undefined && { title: values['title'] }),
    ...(values['type'] !== undefined && { type: values['type'] }),
  };
}

/** Collects every value of a repeatable flag, in the order that the invocation passes them. */
export function readRepeatedValues(flags: readonly MatchedFlag[], name: string): string[] {
  return flags.flatMap((flag) => (flag.name === name && flag.value !== null ? flag.value : []));
}

/** Reads a value flag that the subcommand requires, refusing one that is absent or blank. */
export function readRequiredValue(subcommand: Subcommand, values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`${subcommand} requires --${name}`);
  }
  return value;
}

/** Refuses a positional argument that the subcommand does not take. */
export function refusePositionals(positionals: readonly string[]): void {
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
}
