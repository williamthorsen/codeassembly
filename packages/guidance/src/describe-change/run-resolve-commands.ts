import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  applyOverrides,
  type ChangeRecord,
  compileTemplate,
  normalizeChangeRecord,
  type Taxonomy,
} from '@williamthorsen/change-grammar';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { describeTaxonomyLocation, loadTaxonomy } from '../lib/work-types.ts';
import type { ChangeEntry } from './change-entries.ts';
import { readChangeRecordBlock, type RecordOverrides } from './change-record-block.ts';
import { consolidateBranch } from './consolidate-branch.ts';
import { findDefects } from './find-defects.ts';
import type { DescribeChangeGit } from './git.ts';
import { resolveProjectRoot } from './load-preferences.ts';
import { MissingCommitError, readCommits } from './read-commits.ts';
import { readDeclaredScopes } from './read-declared-scopes.ts';
import { readLabelMap, resolveLabeledRecord } from './read-label-map.ts';
import { findUnmappedKeys, resolveLabels } from './resolve-labels.ts';
import { type MergeInput, resolveMerge } from './resolve-merge.ts';
import { discoverWorkspaceDirs, mergeScopeDirs, resolveScopes } from './resolve-scopes.ts';
import { resolveTicketType } from './resolve-ticket-type.ts';
import { resolveRunProjectRoot } from './run-project-root.ts';
import { loadTemplatesWithTaxonomy } from './templates.ts';
import type { DescribeResult, ResolveLabelsOutcome, ResolveMergeArgs, RunInput } from './types.ts';

/**
 * Applies the overrides to the record and reports the effective record with its defects. Only the taxonomy is loaded,
 * which the defects are checked against, so the run does not read a title template or the repository.
 */
export async function runResolveEffectiveRecord(
  args: { overrides: RecordOverrides; record: ChangeRecord },
  input: RunInput,
): Promise<DescribeResult> {
  const taxonomy = await loadTaxonomy(input.dataDir);
  if (taxonomy === null) {
    throw new Error(
      `resolve-effective-record checks types against the taxonomy; none is readable ${describeTaxonomyLocation(input.dataDir)}`,
    );
  }
  const effective = applyOverrides(normalizeChangeRecord(args.record), args.overrides);
  return {
    output: {
      effective_record: {
        title: effective.title ?? null,
        scope: effective.scope ?? null,
        type: effective.type ?? null,
        breaking: effective.breaking === true,
        ticket_ref: null,
        pr_number: null,
      },
      defects: findDefects(effective, taxonomy),
    },
    warnings: [],
  };
}

/**
 * Resolves a change's labels through the repository's label map, from the effective record that the flags pass and,
 * when the invocation names a body file, from the entries in its last `change-record` block. The body file is read
 * relative to the invoking directory, and the label map from the repository root.
 */
export async function runResolveLabels(
  args: { bodyFile?: string; record: ChangeRecord },
  input: RunInput,
): Promise<DescribeResult> {
  const { projectRoot, warning } = resolveRunProjectRoot(input);
  const body =
    args.bodyFile === undefined ? { entries: [], warnings: [] } : await readBodyEntries(input.cwd, args.bodyFile);
  const warnings = [...(warning === undefined ? [] : [warning]), ...body.warnings];
  const labelMapPath = path.join(projectRoot, '.meta', 'label-map.json');
  const labelMap = await readLabelMap(labelMapPath);
  const labelInput = { entries: body.entries, labelMap, record: normalizeChangeRecord(args.record) };
  const unmapped = findUnmappedKeys(labelInput);
  warnings.push(
    ...unmapped.types.map((key) => `label map ${labelMapPath} does not define type "${key}"; leaving it unlabeled`),
    ...unmapped.scopes.map((key) => `label map ${labelMapPath} does not define scope "${key}"; leaving it unlabeled`),
  );
  const output: ResolveLabelsOutcome = { labels: resolveLabels(labelInput) };
  return { output, warnings };
}

/**
 * Resolves a merge from the invocation: reads the pull request's body from its file and its block from the body,
 * resolves its labels through the repository's label map, consolidates its commits, and hands all of it to
 * `resolveMerge`. The body file is read relative to the invoking directory, and the label map and the commits from the
 * repository root.
 */
export async function runResolveMerge(args: ResolveMergeArgs, input: RunInput): Promise<DescribeResult> {
  const { projectRoot, taxonomy, templates, warnings } = await loadTemplatesWithTaxonomy(
    input,
    'resolve-merge checks types against the taxonomy',
  );
  const bodyPath = path.resolve(input.cwd, args.prBodyFile);
  let body: string;
  try {
    body = await readFile(bodyPath, 'utf8');
  } catch (error) {
    throw chainError(`--pr-body-file ${bodyPath} cannot be read`, error);
  }

  const labelMap = await readLabelMap(path.join(projectRoot, '.meta', 'label-map.json'));
  const commits = await consolidatePullRequestCommits({
    args,
    cwd: projectRoot,
    git: input.git,
    taxonomy,
    template: templates.commit,
  });
  const output = resolveMerge({
    block: readChangeRecordBlock(body),
    commits,
    labels: resolveLabeledRecord(labelMap, args.prLabels),
    overrides: args.overrides,
    pr: { body, headCommit: args.headCommit, number: args.prNumber, title: args.prTitle },
    taxonomy,
    templates,
    ...(args.ticketRef !== undefined && { ticketRef: args.ticketRef }),
  });
  return { output, warnings };
}

/**
 * Resolves each given path's scope from the repository's workspace packages and the scope directories that its
 * preferences file declares. The run is anchored at the repository root, so a path is read the same way whatever
 * subdirectory the caller invoked it from.
 */
export async function runResolveScopes(paths: readonly string[], input: RunInput): Promise<DescribeResult> {
  const { projectRoot, warning } = resolveProjectRoot(input.cwd, input.git);
  const declared = await readDeclaredScopes(projectRoot);
  const scopeDirs = mergeScopeDirs({
    declaredDirs: declared.scopeDirs,
    packageDirs: discoverWorkspaceDirs(projectRoot),
  });
  const { pathScopes, scopes } = resolveScopes({ paths, projectRoot, scopeDirs });
  const warnings = [...(warning === undefined ? [] : [warning]), ...declared.warnings];
  return { output: { path_scopes: pathScopes, scopes }, warnings };
}

/** Resolves the work type that the ticket's labels name through the repository's label map. */
export async function runResolveTicketType(ticketLabels: readonly string[], input: RunInput): Promise<DescribeResult> {
  const { projectRoot, warning } = resolveProjectRoot(input.cwd, input.git);
  const ticketType = await resolveTicketType({
    labelMapPath: path.join(projectRoot, '.meta', 'label-map.json'),
    labels: ticketLabels,
  });
  return { output: { ticket_type: ticketType ?? null }, warnings: warning === undefined ? [] : [warning] };
}

// region | Helpers

/**
 * Consolidates a pull request's commits, reading the range to its head commit. A head commit absent from the local
 * repository, and an empty `commit.title_format`, leave the commits unavailable with the reason named, so the merge
 * still resolves; any other git failure propagates.
 */
async function consolidatePullRequestCommits(input: {
  args: ResolveMergeArgs;
  cwd: string;
  git: DescribeChangeGit;
  taxonomy: Taxonomy;
  template: string;
}): Promise<MergeInput['commits']> {
  if (input.template === '') {
    return {
      kind: 'unavailable',
      reason: 'commit.title_format is empty, so the commits and the title prefix cannot be read through it',
    };
  }
  try {
    const commits = await readCommits({
      baseRef: input.args.baseRef,
      cwd: input.cwd,
      git: input.git,
      headRef: input.args.headCommit,
    });
    const { consolidatedRecord } = consolidateBranch(commits, compileTemplate(input.template), input.taxonomy);
    return { ...(consolidatedRecord !== undefined && { consolidatedRecord }), kind: 'read' };
  } catch (error) {
    if (error instanceof MissingCommitError) {
      return { kind: 'unavailable', reason: `the head commit ${error.ref} is not in the local repository` };
    }
    throw error;
  }
}

/**
 * Reads the entries in the last `change-record` block of the body file, resolved against the invoking directory. A
 * block that is absent, malformed, or without entries yields none, and a defective one is reported as a warning.
 */
async function readBodyEntries(
  cwd: string,
  bodyFile: string,
): Promise<{ entries: readonly ChangeEntry[]; warnings: string[] }> {
  const bodyPath = path.resolve(cwd, bodyFile);
  let body: string;
  try {
    body = await readFile(bodyPath, 'utf8');
  } catch (error) {
    throw chainError(`--body-file ${bodyPath} cannot be read`, error);
  }

  const reading = readChangeRecordBlock(body);
  if (reading.kind === 'malformed') {
    return {
      entries: [],
      warnings: [`the body’s change-record block is malformed, so the entries do not add any label: ${reading.defect}`],
    };
  }
  if (reading.kind !== 'read') {
    return { entries: [], warnings: [] };
  }
  if (reading.entriesDefect !== undefined) {
    return {
      entries: [],
      warnings: [
        `the body’s change entries are malformed, so the entries do not add any label: ${reading.entriesDefect}`,
      ],
    };
  }
  return { entries: reading.block.entries ?? [], warnings: [] };
}

// endregion | Helpers
