/**
 * The per-repository sweep record, `.agents/revise-prose.yaml`.
 *
 * The record answers two questions on a later run: which paths a rule has already been swept over at its current
 * sweep version and whether its detector ran, and which sites an adjudicator has already rejected. A rejected site need
 * not be one a detector reports, so the second answer reaches a rule whose sites no candidate nominates. A raised sweep
 * version marks that rule's rejections stale rather than deleting them, so a rule's revision re-opens its rejections
 * for review instead of discarding the judgment behind them. A sweep at the new version is that review, and recording
 * it retires the stale rejections under its roots.
 *
 * A rejection resolves to a site by containment rather than by an exact string: see {@link applyRejections}. The record
 * and the detector describe one site in spans of different lengths, so a phrase is what a reader locates the site by
 * rather than a string the detector must reproduce. Retiring one entry for another is the stricter test, since two
 * spans that merely overlap are not the same judgment: {@link rejectionKey} compares the whole phrase, normalized.
 *
 * Only {@link composeRecord} and {@link stringifyRecord} produce a record. The helper's `record` command is the one
 * write path, which is what keeps the YAML deterministic rather than hand-edited into drift.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { convertLegacyRecord } from './convert-record.ts';
import { maskCodeSpans } from './mask-code-spans.ts';
import { flattenWhitespace } from './span-text.ts';
import type {
  Candidate,
  PriorRejection,
  ProseRecord,
  RecordedRejection,
  RunFold,
  SiteText,
  SweepVersions,
} from './types.ts';

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
 * A rule name. Any rule a bound rulebook declares is recordable, detected or not, so the shape is all that is held
 * here: pinning the detector registry's names would make a rule's coverage depend on holding a detector.
 */
const RuleNameSchema = z.string().regex(RULE_NAME_PATTERN, 'rule must be a lowercase kebab-case name');

/** An ISO date, which is the precision a sweep is dated to; a sweep is not an event with a time of day. */
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

/** A rule's coverage: the sweep version swept, when it was last swept, whether its detector ran, and the roots covered. */
const RuleCoverageSchema = z.object({
  version: z.string().min(1),
  'swept-at': DateSchema,
  detected: z.boolean(),
  roots: z.array(z.string().min(1)).min(1),
});

/** One rejection, resolved to a site by its rule, its file, and its phrase. */
const RejectionSchema = z.object({
  rule: RuleNameSchema,
  'rule-version': z.string().min(1),
  file: z.string().min(1),
  phrase: z.string().min(1),
  ground: z.string().min(1),
});

/** The whole record. Both keys default to empty, so a record naming one of them parses. */
const ProseRecordSchema = z.object({
  rules: z.record(RuleNameSchema, RuleCoverageSchema).default({}),
  rejections: z.array(RejectionSchema).default([]),
});

/** A record written before rules were versioned. A unit written without `rules` parses as having run no detector. */
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

/** One rejection as a run reports it: no version, which the helper derives from the fold's entry for its rule. */
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
 * Applies the record's rejections to a candidate set: a candidate matching a rejection at its rule's current version
 * is dropped, and one matching a rejection recorded at an older version is kept and marked stale, which re-opens the
 * judgment for review rather than discarding it.
 *
 * A candidate can match both a live rejection and a stale one recorded beside it. The live rejection decides, so
 * whether the site is suppressed follows from the record's content rather than from its order.
 */
export function applyRejections(
  candidates: readonly Candidate[],
  record: ProseRecord,
  ruleVersions: ReadonlyMap<string, string>,
): Candidate[] {
  const bySite = new Map<string, RecordedRejection[]>();
  for (const rejection of record.rejections) {
    const site = composeKey(rejection.rule, rejection.file);
    const held = bySite.get(site);
    if (held === undefined) bySite.set(site, [rejection]);
    else held.push(rejection);
  }

  const applied: Candidate[] = [];

  for (const candidate of candidates) {
    const matched = (bySite.get(composeKey(candidate.rule, candidate.file)) ?? []).filter((rejection) =>
      coversPhrase(rejection.phrase, candidate.phrase),
    );
    if (matched.length === 0) {
      applied.push(candidate);
      continue;
    }
    if (matched.every((rejection) => isStaleRejection(rejection, ruleVersions))) {
      applied.push({ ...candidate, stale: true });
    }
  }

  return applied;
}

/**
 * Merges a run's fold into the prior record and returns the result.
 *
 * Leaves the coverage and the rejections of a rule that the run did not version untouched, so a narrowed run never
 * retracts what a wider one recorded. For a rule that the run did version, at the version and with the detector state
 * already recorded, adds the run's roots to the recorded ones, both sweeps having happened. After a raised version,
 * replaces the recorded roots with the run's, the earlier sweep having been taken against a rule that has since
 * changed, and does the same when the detector state differs, the recorded roots having been swept with a different
 * set of candidates.
 *
 * A prior rejection under the roots that the run swept, for a rule that the run versioned, is kept at the rule's
 * current version while `hasSite` still finds its site, since a sweeper reports nothing for an inherited rejection and
 * the agent never dispatches a batch that the record already covers. One at an older version is retired: the run
 * reviewed it at the new version, and a site that it rejected again is in the fold. `hasSite` is consulted for a
 * current-version rejection under those roots alone. A rejection outside them was never revisited, so it is carried
 * forward, which is what keeps a run narrowed to one directory from retracting the judgment recorded everywhere else.
 */
export function composeRecord(
  prior: ProseRecord,
  fold: RunFold,
  hasSite: (rejection: RecordedRejection) => boolean,
  hasDetector: (rule: string) => boolean,
): ProseRecord {
  const rules = { ...prior.rules };
  for (const [rule, { version }] of Object.entries(fold.rules)) {
    const detected = hasDetector(rule);
    const priorCoverage = prior.rules[rule];
    const keptRoots =
      priorCoverage !== undefined && priorCoverage.version === version && priorCoverage.detected === detected
        ? priorCoverage.roots
        : [];
    rules[rule] = { version, 'swept-at': fold.sweptAt, detected, roots: mergeRoots(keptRoots, fold.roots) };
  }

  const recorded: RecordedRejection[] = fold.rejections.map((rejection) => {
    const version = fold.rules[rejection.rule]?.version;
    if (version === undefined) {
      throw new Error(`rejection names rule "${rejection.rule}", which the fold does not version`);
    }
    return { ...rejection, 'rule-version': version };
  });

  // A key the run re-recorded supersedes whatever the record held for it, which would otherwise stand beside the new
  // entry as a second one for the same site.
  const rerecorded = new Set(recorded.map((rejection) => rejectionKey(rejection)));
  const carried = prior.rejections.filter((rejection) => {
    if (rerecorded.has(rejectionKey(rejection))) return false;

    const swept = fold.rules[rejection.rule];
    if (swept === undefined || fold.roots.every((root) => !isUnderRoot(rejection.file, root))) return true;

    return rejection['rule-version'] === swept.version && hasSite(rejection);
  });

  return { rules, rejections: sortRejections([...carried, ...recorded]) };
}

/**
 * Reports whether a file still holds a recorded phrase: in its extracted prose, normalized as a detector's phrase is
 * compared, or in its content, with only whitespace and Unicode form normalized. The content reading finds a phrase
 * reported verbatim across the comment markers that extraction strips.
 */
export function containsPhrase(text: SiteText, phrase: string): boolean {
  if (flattenWhitespace(text.prose.normalize('NFC')).includes(normalizeForMatch(phrase))) return true;

  return flattenWhitespace(text.content.normalize('NFC')).includes(flattenWhitespace(phrase.normalize('NFC')));
}

/** Reports whether a rejection was recorded at a version older than the one a run holds for its rule. */
export function isStaleRejection(rejection: RecordedRejection, ruleVersions: ReadonlyMap<string, string>): boolean {
  const current = ruleVersions.get(rejection.rule);
  return current !== undefined && current !== rejection['rule-version'];
}

/**
 * Lists the rules that the run versions and for which the record does not cover `file`, in the run's order. A rule
 * covers the file at the rule's current version, under one of its roots, and, if the helper holds the rule's detector,
 * with that detector having run. A rule recorded at another version covers nothing, its sweep having been taken against
 * a rule that has since changed; a sweep that ran without a rule's detector never saw that rule's candidates.
 */
export function listUnsweptRules(
  record: ProseRecord,
  ruleVersions: ReadonlyMap<string, string>,
  hasDetector: (rule: string) => boolean,
  file: string,
): string[] {
  const unswept: string[] = [];

  for (const [rule, version] of ruleVersions) {
    const coverage = record.rules[rule];
    const isCovered =
      coverage !== undefined &&
      coverage.version === version &&
      (coverage.detected || !hasDetector(rule)) &&
      coverage.roots.some((root) => isUnderRoot(file, root));
    if (!isCovered) unswept.push(rule);
  }

  return unswept;
}

/**
 * Parses a record's YAML, converting one written before rules were versioned against the run's versions. An absent
 * record is the empty one, since a repository never swept has recorded nothing; malformed YAML throws, because silently
 * treating it as empty would erase every rejection on the next write. A record holding both `units` and `rules` throws
 * too, since neither shape accounts for the other's entries.
 */
export function parseRecord(content: string, versions: SweepVersions, sourceLabel: string = RECORD_PATH): ProseRecord {
  const parsed: unknown = content.trim() === '' ? {} : parseYaml(content);
  const isLegacy = typeof parsed === 'object' && parsed !== null && Object.hasOwn(parsed, 'units');

  if (isLegacy && Object.hasOwn(parsed, 'rules')) {
    throw new Error(`Invalid sweep record in ${sourceLabel}: (root): holds both units and rules`);
  }

  if (isLegacy) {
    const legacy = LegacyRecordSchema.safeParse(parsed);
    if (!legacy.success) throw new Error(`Invalid sweep record in ${sourceLabel}: ${describeIssues(legacy.error)}`);
    return convertLegacyRecord(legacy.data, versions);
  }

  const result = ProseRecordSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Invalid sweep record in ${sourceLabel}: ${describeIssues(result.error)}`);

  return result.data;
}

/**
 * Parses a run's fold from the JSON the `record` command reads on standard input. A malformed fold throws rather than
 * writing a partial record, the record being the only durable trace of what a sweep adjudicated.
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

/**
 * Selects the rejections a run inherits: those recorded against a file it read, under a rule the run versions, at that
 * rule's current version. A stale one is withheld, so its site reaches the sweeper with no prior verdict attached and
 * is adjudicated afresh, which is what makes a raised version a review rather than a deletion.
 *
 * A rejection whose rule the run does not version is withheld on the same ground: no version stands to hold it against,
 * so nothing could ever re-open it.
 *
 * The projection drops the record's own bookkeeping. A settled site needs no argument, and the ground behind it would
 * seed the judgment of a sweeper who meets the site again once the rejection goes stale.
 */
export function selectPriorRejections(
  record: ProseRecord,
  ruleVersions: ReadonlyMap<string, string>,
  files: readonly string[],
): PriorRejection[] {
  const read = new Set(files);

  return record.rejections
    .filter(
      (rejection) =>
        read.has(rejection.file) && ruleVersions.has(rejection.rule) && !isStaleRejection(rejection, ruleVersions),
    )
    .map(({ rule, file, phrase }) => ({ rule, file, phrase }));
}

/**
 * Renders a record as YAML, with rules keyed in sorted order and rejections sorted by rule, file, and phrase, each
 * entry's fields in a fixed order. Re-writing an unchanged record is byte-identical, which is what keeps the file out
 * of a diff it did not earn.
 */
export function stringifyRecord(record: ProseRecord): string {
  const rules = Object.fromEntries(
    Object.entries(record.rules)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([rule, coverage]) => [
        rule,
        {
          version: coverage.version,
          'swept-at': coverage['swept-at'],
          detected: coverage.detected,
          roots: coverage.roots,
        },
      ]),
  );
  const rejections = sortRejections(record.rejections).map((rejection) => ({
    rule: rejection.rule,
    'rule-version': rejection['rule-version'],
    file: rejection.file,
    phrase: rejection.phrase,
    ground: rejection.ground,
  }));

  return stringifyYaml({ rules, rejections }, { lineWidth: 0 });
}

// region | Helpers

/** Joins the parts of a key on a delimiter that no rule, path, or phrase can contain. */
function composeKey(...parts: readonly string[]): string {
  return parts.join('\u{0}');
}

/**
 * Reports whether a recorded phrase and a candidate's phrase name one site: either normalized form containing the
 * other.
 *
 * The two come from different producers. The record holds the span reported by an adjudicator, readable enough to
 * locate the site by eye; the candidate holds the span emitted by its detector, which is shorter and carries a
 * placeholder where an inline code span stood. Normalizing both through the detector's own pipeline puts them in one
 * form, and containment then resolves the length difference that remains. It runs both ways because an em-dash
 * candidate's phrase is its whole sentence, which a recorded phrase sits inside rather than around.
 */
function coversPhrase(recorded: string, detected: string): boolean {
  const left = normalizeForMatch(recorded);
  const right = normalizeForMatch(detected);
  return left.includes(right) || right.includes(left);
}

/** Renders a schema failure's issues as one line, each prefixed with the path it concerns. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

/** Reports whether a repository-relative path lies under a recorded root, `.` covering the whole repository. */
function isUnderRoot(file: string, root: string): boolean {
  return root === '.' || file === root || file.startsWith(`${root}/`);
}

/**
 * Joins two root sets into the smallest set covering both, dropping a root that another one already contains, and
 * returns it sorted. Without the containment drop, every narrowed sweep would append a root that `.` already covers.
 */
function mergeRoots(recorded: readonly string[], swept: readonly string[]): string[] {
  const roots = [...new Set([...recorded, ...swept])];
  return roots.filter((root) => roots.every((other) => other === root || !isUnderRoot(root, other))).toSorted();
}

/**
 * Renders a phrase in the form in which the two sides are compared: inline code spans masked, NFC, and whitespace
 * collapsed. This is the pipeline through which a detector's phrase already passed, applied to a recorded phrase too,
 * so a reflow or a backticked token cannot separate one from the other.
 */
function normalizeForMatch(phrase: string): string {
  return flattenWhitespace(maskCodeSpans(phrase.normalize('NFC')));
}

/**
 * One rejection's identity within the record: its rule, its file, and its normalized phrase. Normalizing here is what
 * lets a re-record retire the entry it supersedes across a repair that only reflowed the line.
 */
function rejectionKey(rejection: RecordedRejection): string {
  return composeKey(rejection.rule, rejection.file, normalizeForMatch(rejection.phrase));
}

/** Orders rejections by rule, file, and phrase, which is what makes a rewrite of unchanged content byte-identical. */
function sortRejections(rejections: readonly RecordedRejection[]): RecordedRejection[] {
  return [...rejections].toSorted(
    (a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.phrase.localeCompare(b.phrase),
  );
}

// endregion | Helpers
