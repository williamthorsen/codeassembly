import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type CommandContext, CommandError, type CommandResult } from './command.ts';
import { findCrossReferences } from './cross-reference.ts';
import { fetchOpenIssues, resolveRepository, resolveShortSha } from './fetch.ts';
import type { BacklogGit } from './git.ts';
import { detectInProgress } from './in-progress.ts';
import { readLedger, resolveLedgerPaths } from './ledger.ts';
import { findLatestMarker, findLatestRunMarkerDate } from './marker.ts';
import { type ParsedFlags, parsePositiveInteger, readOptional, readRequired } from './parse-flags.ts';
import { applySelectors, groupByScope, orderForSweep, parseAge } from './select.ts';
import type { Issue, TicketInput } from './types.ts';

/**
 * Selects the backlog narrowed by the selectors and writes one input file per ticket under `--out`.
 * A ticket already assessed in this run is skipped unless it changed after that assessment, the latest comment
 * containing this run's marker, and the latest decision that this run applied to it, so that the sweep's own writes do
 * not make a ticket look changed: GitHub stamps `updatedAt` a moment after the comment that caused it. A skipped ticket
 * whose latest assessment has an auto-close class and is not followed by any decision is reported in
 * `pendingAutomatic`, so that the skill still applies it.
 */
export async function runCollect(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const outDir = path.resolve(context.root, readRequired(flags, 'out'));

  const paths = await resolveLedgerPaths(context.git, context.root);
  const ledger = readLedger(paths.ledgerFile);
  const assessedAt = new Map<number, string>();
  const decidedAt = new Map<number, string>();
  const undecidedClass = new Map<number, string | undefined>();
  for (const record of ledger.records) {
    if (record.run !== run) continue;
    if (record.kind === 'assessment') {
      assessedAt.set(record.number, record.assessedAt);
      undecidedClass.set(record.number, record.class);
    } else if (record.kind === 'decision') {
      decidedAt.set(record.number, record.appliedAt);
      undecidedClass.delete(record.number);
    }
  }

  const repository = await resolveRepository(context.run, context.git, context.root);
  const sha = await resolveShortSha(context.git, context.root);
  const selection = await selectBacklog(flags, context);

  const resumed: number[] = [];
  const pending = selection.ordered.filter((issue) => {
    const assessed = assessedAt.get(issue.number);
    if (assessed === undefined) return true;
    const sweepWrites = [assessed, findLatestRunMarkerDate(issue.comments, run), decidedAt.get(issue.number)];
    const lastSweepWrite = Math.max(...sweepWrites.flatMap((date) => (date === undefined ? [] : Date.parse(date))));
    const changed = Date.parse(issue.updatedAt) > lastSweepWrite;
    if (!changed) resumed.push(issue.number);
    return changed;
  });
  const pendingAutomatic = resumed.flatMap((number) => {
    const policyClass = undecidedClass.get(number);
    return policyClass === 'auto-close-complete' || policyClass === 'auto-close-half-met'
      ? { number, class: policyClass }
      : [];
  });
  const issues = selection.limit === undefined ? pending : pending.slice(0, selection.limit);

  const numbers = new Set(issues.map((issue) => issue.number));
  const inProgress = await detectInProgress({
    defaultBranch: repository.defaultBranch,
    git: context.git,
    numbers,
    root: context.root,
  });
  const crossReferences = await findCrossReferences({
    defaultBranch: await resolveLogRef(context.git, context.root, repository.defaultBranch),
    git: context.git,
    issues,
    nameWithOwner: repository.nameWithOwner,
    root: context.root,
    run: context.run,
  });

  mkdirSync(outDir, { recursive: true });
  const tickets: Array<{ file: string; number: number }> = [];
  for (const issue of issues) {
    const input: TicketInput = {
      ...issue,
      crossReferences: crossReferences.get(issue.number) ?? [],
      inProgress: inProgress.get(issue.number) ?? null,
      priorMarker: findLatestMarker(issue.comments),
    };
    const file = path.join(outDir, `${issue.number}.json`);
    writeFileSync(file, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
    tickets.push({ file, number: issue.number });
  }

  const groups = groupByScope(issues, inProgress);
  return {
    ok: true,
    run,
    sha,
    ledger: paths.ledgerFile,
    ledgerDefects: ledger.defects,
    counts: {
      fetched: selection.fetched,
      selected: selection.ordered.length,
      resumed: resumed.length,
      total: issues.length,
    },
    resumed,
    pendingAutomatic,
    groups,
    tickets,
  };
}

// region | Helpers

/** Returns the ref whose log the cross-reference pass reads: the remote's default branch when it is fetched. */
async function resolveLogRef(git: BacklogGit, root: string, defaultBranch: string): Promise<string> {
  return (await git.hasRef(root, `refs/remotes/origin/${defaultBranch}`)) ? `origin/${defaultBranch}` : defaultBranch;
}

/** Selects the backlog by `--scope`, `--exclude-label`, and `--older-than`, in sweep order, capped by `--limit`. */
async function selectBacklog(flags: ParsedFlags, context: CommandContext): Promise<Selection> {
  const olderThan = readOptional(flags, 'older-than');
  const limit = readOptional(flags, 'limit');
  let olderThanDays: number | undefined;
  try {
    olderThanDays = olderThan === undefined ? undefined : parseAge(olderThan);
  } catch (error) {
    throw new CommandError('invalid-args', describeError(error));
  }
  const selectors = {
    excludeLabels: flags.get('exclude-label') ?? [],
    limit: limit === undefined ? undefined : parsePositiveInteger('limit', limit),
    olderThanDays,
    scopes: flags.get('scope') ?? [],
  };
  const fetched = await fetchOpenIssues(context.run, context.root);
  return {
    fetched: fetched.length,
    limit: selectors.limit,
    ordered: orderForSweep(applySelectors(fetched, selectors, context.now)),
  };
}

/** The tickets that `collect` assesses, in assessment order, before the resume rule and the cap. */
interface Selection {
  fetched: number;
  limit: number | undefined;
  ordered: Issue[];
}

// endregion | Helpers
