/**
 * The per-repository sweep record, `.agents/revise-prose.yaml`.
 *
 * The record answers two questions on a later run: which paths a rule has already been swept over at its current
 * sweep version, whether its detector ran, and whether each file's prose is unchanged since then; and which sites an
 * adjudicator has already rejected. A rejected site need not be one that a detector reports, so the second answer
 * applies to a rule whose sites are not nominated by any candidate. Because a raised sweep version marks that rule's
 * rejections stale rather than deleting them, a rule's revision re-opens its rejections for review instead of
 * discarding the judgment behind them. A sweep at the new version is that review, and recording it retires the stale
 * rejections under its roots.
 *
 * A rejection resolves to a site by containment, so that a phrase is what a reader locates the site by rather than a
 * string that the detector must reproduce. Retiring one entry for another is the stricter test, two spans that merely
 * overlap not being the same judgment.
 *
 * Only {@link composeRecord} and {@link stringifyRecord} produce a record. The helper's `record` command is the one
 * write path, which is what keeps the YAML deterministic rather than hand-edited into drift.
 */
import { Document, isMap } from 'yaml';

import { maskCodeSpans } from './mask-code-spans.ts';
import { flattenWhitespace } from './span-text.ts';
import type {
  Candidate,
  FileCoverage,
  PriorRejection,
  ProseRecord,
  RecordedRejection,
  RunFold,
  SiteText,
} from './types.ts';

/**
 * Applies the record's rejections to a candidate set: A candidate matching a rejection at its rule's current version
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
 * `hashes` holds the current prose hash of each file that the run's scan yielded under its roots. Each such file is
 * recorded at that hash: with its recorded rules and the run's when its prose is unchanged, and with the run's alone
 * when it changed, the recorded rules having been swept against other prose. A recorded file under the run's roots that
 * the scan no longer yields is dropped, and every file outside them is carried.
 *
 * A prior rejection under the roots that the run swept, for a rule that the run versioned, is kept at the rule's
 * current version while `hasSite` still finds its site, since a sweeper reports nothing for an inherited rejection and
 * the agent never dispatches a batch that the record already covers. One at an older version is retired: The run
 * reviewed it at the new version, and a site that it rejected again is in the fold. `hasSite` is consulted for a
 * current-version rejection under those roots alone. A rejection outside them was never revisited, so it is carried
 * forward, which is what keeps a run narrowed to one directory from retracting the judgment recorded everywhere else.
 */
export function composeRecord(
  prior: ProseRecord,
  fold: RunFold,
  hasSite: (rejection: RecordedRejection) => boolean,
  hasDetector: (rule: string) => boolean,
  hashes: ReadonlyMap<string, string>,
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

  const runRules = Object.keys(fold.rules);
  const priorFiles = prior.files ?? {};
  const files: Record<string, FileCoverage> = {};
  for (const [file, coverage] of Object.entries(priorFiles)) {
    if (fold.roots.every((root) => !isUnderRoot(file, root))) files[file] = coverage;
  }
  for (const [file, hash] of hashes) {
    const priorFile = priorFiles[file];
    const fileRules = priorFile?.hash === hash ? [...new Set([...priorFile.rules, ...runRules])] : runRules;
    files[file] = { hash, rules: fileRules.toSorted() };
  }

  const recorded: RecordedRejection[] = fold.rejections.map((rejection) => {
    const version = fold.rules[rejection.rule]?.version;
    if (version === undefined) {
      throw new Error(`rejection names rule "${rejection.rule}", which the fold does not version`);
    }
    return { ...rejection, 'rule-version': version };
  });

  // A key re-recorded by the run supersedes whatever the record contained for it, which would otherwise remain beside
  // the new entry as a second one for the same site.
  const rerecorded = new Set(recorded.map((rejection) => rejectionKey(rejection)));
  const carried = prior.rejections.filter((rejection) => {
    if (rerecorded.has(rejectionKey(rejection))) return false;

    const swept = fold.rules[rejection.rule];
    if (swept === undefined || fold.roots.every((root) => !isUnderRoot(rejection.file, root))) return true;

    return rejection['rule-version'] === swept.version && hasSite(rejection);
  });

  return { rules, files, rejections: sortRejections([...carried, ...recorded]) };
}

/**
 * Reports whether a file still contains a recorded phrase: in its extracted prose, normalized as a detector's phrase is
 * compared, or in its content, with only whitespace and Unicode form normalized. The content reading finds a phrase
 * reported verbatim across the comment markers that extraction strips.
 */
export function containsPhrase(text: SiteText, phrase: string): boolean {
  if (flattenWhitespace(text.prose.normalize('NFC')).includes(normalizeForMatch(phrase))) return true;

  return flattenWhitespace(text.content.normalize('NFC')).includes(flattenWhitespace(phrase.normalize('NFC')));
}

/** Reports whether a rejection was recorded at a version older than the one that a run declares for its rule. */
export function isStaleRejection(rejection: RecordedRejection, ruleVersions: ReadonlyMap<string, string>): boolean {
  const current = ruleVersions.get(rejection.rule);
  return current !== undefined && current !== rejection['rule-version'];
}

/**
 * Lists the rules that the run versions and for which the record does not cover `file`, in the run's order. A rule
 * covers the file at the rule's current version, under one of its roots, if the helper has a detector for the rule
 * with that detector having run, and with the file recorded for the rule at `hash`, its current prose hash. A file
 * without a hash, or one that the record does not list, is covered by no rule, its prose never having been swept as it
 * reads now. A rule recorded at another version covers nothing, its sweep having been taken against a rule that has
 * since changed; a sweep that ran without a rule's detector never saw that rule's candidates.
 */
export function listUnsweptRules(
  record: ProseRecord,
  ruleVersions: ReadonlyMap<string, string>,
  hasDetector: (rule: string) => boolean,
  file: string,
  hash: string | undefined,
): string[] {
  const unswept: string[] = [];
  const fileCoverage = record.files?.[file];
  const sweptRules =
    hash !== undefined && fileCoverage?.hash === hash ? new Set(fileCoverage.rules) : new Set<string>();

  for (const [rule, version] of ruleVersions) {
    const coverage = record.rules[rule];
    const isCovered =
      coverage !== undefined &&
      coverage.version === version &&
      (coverage.detected || !hasDetector(rule)) &&
      coverage.roots.some((root) => isUnderRoot(file, root)) &&
      sweptRules.has(rule);
    if (!isCovered) unswept.push(rule);
  }

  return unswept;
}

/**
 * Returns the record with a `files` table seeded from `hashes`, unless it already has one. A record written before
 * files were hashed is taken as a baseline: Each file is recorded at its current hash for the rules whose roots contain
 * it, which keeps the coverage that the record already claimed. A file under no rule's roots is not recorded.
 */
export function seedFiles(record: ProseRecord, hashes: ReadonlyMap<string, string>): ProseRecord {
  if (record.files !== undefined) return record;

  const files: Record<string, FileCoverage> = {};
  for (const [file, hash] of hashes) {
    const rules = Object.entries(record.rules)
      .filter(([, coverage]) => coverage.roots.some((root) => isUnderRoot(file, root)))
      .map(([rule]) => rule)
      .toSorted();
    if (rules.length > 0) files[file] = { hash, rules };
  }

  return { ...record, files };
}

/**
 * Selects the rejections inherited by a run: those recorded against a file that it read, under a rule that the run
 * versions, at that rule's current version. A stale one is withheld, so the sweeper receives its site without a prior
 * verdict attached and adjudicates it afresh, which is what makes a raised version a review rather than a deletion.
 *
 * A rejection whose rule the run does not version is withheld on the same ground: Because the run doesn't have a
 * version of that rule to compare it against, nothing could ever re-open it.
 *
 * The projection hands over the rule, the file, and the phrase alone, dropping the rule version and the `ground`. A
 * standing rejection tells the sweeper to leave the site alone, and that instruction doesn't need a reason. The
 * `ground` would be useful to a sweeper only on the run that re-opens the site, and that is the one run that has to
 * adjudicate it without a prior reason in hand.
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
 * Renders a record as YAML in a fixed key order, each file's coverage on one line. Re-writing an unchanged record is
 * byte-identical, which keeps the file out of the diff.
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
  const files =
    record.files === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(record.files)
            .toSorted(([left], [right]) => left.localeCompare(right))
            .map(([file, coverage]) => [file, { hash: coverage.hash, rules: coverage.rules }]),
        );
  const rejections = sortRejections(record.rejections).map((rejection) => ({
    rule: rejection.rule,
    'rule-version': rejection['rule-version'],
    file: rejection.file,
    phrase: rejection.phrase,
    ground: rejection.ground,
  }));

  const document = new Document(
    { rules, ...(files !== undefined && { files }), rejections },
    { aliasDuplicateObjects: false },
  );
  const filesNode = document.get('files');
  if (isMap(filesNode)) {
    for (const pair of filesNode.items) {
      if (isMap(pair.value)) pair.value.flow = true;
    }
  }

  return document.toString({ lineWidth: 0 });
}

// region | Helpers

/** Joins the parts of a key on a delimiter that cannot appear in any rule, path, or phrase. */
function composeKey(...parts: readonly string[]): string {
  return parts.join('\u{0}');
}

/**
 * Reports whether a recorded phrase and a candidate's phrase name one site: either normalized form containing the
 * other.
 *
 * The two come from different producers. The record contains the span reported by an adjudicator, readable enough to
 * locate the site by eye; the candidate contains the span emitted by its detector, which is shorter and contains a
 * placeholder where an inline code span stood. Normalizing both through the detector's own pipeline puts them in one
 * form, and containment then resolves the length difference that remains. It runs both ways because an em-dash
 * candidate's phrase is its whole sentence, and a recorded phrase is inside that sentence rather than around it.
 */
function coversPhrase(recorded: string, detected: string): boolean {
  const left = normalizeForMatch(recorded);
  const right = normalizeForMatch(detected);
  return left.includes(right) || right.includes(left);
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
 * lets a re-record retire the entry that it supersedes across a repair that only reflowed the line.
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
