/**
 * Parsing for the sweep record, `.agents/revise-prose.yaml`, and for the fold that a run reports back for recording.
 */
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { convertLegacyRecord } from './convert-record.ts';
import type { ProseRecord, RunFold, SweepVersions } from './types.ts';

/** Path of the record within a repository. */
export const RECORD_PATH = '.agents/revise-prose.yaml';

/** The shape of a rule name: lowercase kebab-case, letter-led. */
export const RULE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * The shape of a sweep version as a run declares it: a positive integer. A converted legacy rejection records `0`,
 * which this shape keeps any declared version from equalling.
 */
export const SWEEP_VERSION_PATTERN = /^[1-9]\d*$/;

/**
 * A rule name. Any rule declared by a bound rulebook is recordable, detected or not, so only the shape is checked
 * here: Pinning the detector registry's names would make a rule's coverage depend on having a detector.
 */
const RuleNameSchema = z.string().regex(RULE_NAME_PATTERN, 'rule must be a lowercase kebab-case name');

/** An ISO date, which is the precision that a sweep is dated to; a sweep is not an event with a time of day. */
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

const RuleCoverageSchema = z.object({
  version: z.string().min(1),
  'swept-at': DateSchema,
  detected: z.boolean(),
  roots: z.array(z.string().min(1)).min(1),
});

const FileCoverageSchema = z.object({
  hash: z.string().min(1),
  rules: z.array(RuleNameSchema),
});

/** One rejection, resolved to a site by its rule, its file, and its phrase. */
const RejectionSchema = z.object({
  rule: RuleNameSchema,
  'rule-version': z.string().min(1),
  file: z.string().min(1),
  phrase: z.string().min(1),
  ground: z.string().min(1),
});

/**
 * The whole record. `rules` and `rejections` default to empty, so a record naming one of them parses; `files` stays
 * absent from a record written before files were hashed, which {@link seedFiles} tells apart from an empty table.
 */
const ProseRecordSchema = z.object({
  rules: z.record(RuleNameSchema, RuleCoverageSchema).default({}),
  files: z.record(z.string().min(1), FileCoverageSchema).optional(),
  rejections: z.array(RejectionSchema).default([]),
});

/** A record written before rules were versioned. A unit written without `rules` parses as not having run a detector. */
const LegacyRecordSchema = z.object({
  units: z.record(
    z.string(),
    z.object({
      version: z.string().min(1),
      'swept-at': DateSchema,
      rules: z.array(RuleNameSchema).default([]),
      roots: z.array(z.string().min(1)).min(1),
    }),
  ),
  rejections: z
    .array(
      z.object({
        rule: RuleNameSchema,
        unit: z.string().min(1),
        'unit-version': z.string().min(1),
        file: z.string().min(1),
        phrase: z.string().min(1),
        ground: z.string().min(1),
      }),
    )
    .default([]),
});

/**
 * One rejection as a run reports it, without a version, which the helper derives from the fold's entry for its rule.
 */
const FoldRejectionSchema = z.object({
  rule: RuleNameSchema,
  file: z.string().min(1),
  phrase: z.string().min(1),
  ground: z.string().min(1),
});

/**
 * What one run reports back for recording. Every versioned rule names a unit that `units` declares, which is what lets
 * `record` convert a legacy record against the fold alone.
 */
const RunFoldSchema = z
  .object({
    sweptAt: DateSchema,
    roots: z.array(z.string().min(1)).min(1),
    units: z.record(z.string().min(1), z.string().min(1)),
    rules: z.record(
      RuleNameSchema,
      z.object({
        unit: z.string().min(1),
        version: z.string().regex(SWEEP_VERSION_PATTERN, 'a sweep version must be a positive integer'),
      }),
    ),
    rejections: z.array(FoldRejectionSchema).default([]),
  })
  .superRefine((fold, context) => {
    for (const [rule, { unit }] of Object.entries(fold.rules)) {
      if (!Object.hasOwn(fold.units, unit)) {
        context.addIssue({ code: 'custom', path: ['rules', rule, 'unit'], message: `unit "${unit}" is not in units` });
      }
    }
  });

/**
 * Parses a record's YAML, converting one written before rules were versioned against the run's versions. An absent
 * record is the empty one, since a repository never swept has recorded nothing; malformed YAML throws, because silently
 * treating it as empty would erase every rejection on the next write. A record containing both `units` and `rules`
 * throws too, since neither shape accounts for the other's entries.
 */
export function parseRecord(content: string, versions: SweepVersions, sourceLabel: string = RECORD_PATH): ProseRecord {
  const parsed: unknown = content.trim() === '' ? {} : parseYaml(content);
  const isLegacy = typeof parsed === 'object' && parsed !== null && Object.hasOwn(parsed, 'units');

  if (isLegacy && Object.hasOwn(parsed, 'rules')) {
    throw new Error(`Invalid sweep record in ${sourceLabel}: (root): contains both units and rules`);
  }

  if (isLegacy) {
    const legacy = LegacyRecordSchema.safeParse(parsed);
    if (!legacy.success) throw new Error(`Invalid sweep record in ${sourceLabel}: ${describeIssues(legacy.error)}`);
    return convertLegacyRecord(legacy.data, versions);
  }

  const result = ProseRecordSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Invalid sweep record in ${sourceLabel}: ${describeIssues(result.error)}`);

  const { files, ...record } = result.data;
  return files === undefined ? record : { ...record, files };
}

/**
 * Parses a run's fold from the JSON read by the `record` command on standard input. A malformed fold throws rather
 * than writing a partial record, the record being the only durable trace of what a sweep adjudicated.
 */
export function parseRunFold(json: string): RunFold {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid run fold: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  const result = RunFoldSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Invalid run fold: ${describeIssues(result.error)}`);

  return result.data;
}

// region | Helpers

/** Renders a schema failure's issues as one line, each prefixed with the path that it concerns. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

// endregion | Helpers
