import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compileTemplate, render } from '@williamthorsen/change-grammar';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parseDocument } from 'yaml';

import { describeTaxonomyLocation, loadTaxonomy, loadWorkTypeHeadings } from '../lib/work-types.ts';
import { amendEntry, type EntryAmendment } from './amend-entry.ts';
import { type ChangeEntry, consolidateChangeEntries, findEntryComment, readChangeEntries } from './change-entries.ts';
import { type ChangeRecordBlock, readMergeChangeRecordBlock, renderChangeRecordBlock } from './change-record-block.ts';
import { consolidateBranch } from './consolidate-branch.ts';
import { findEntryDefects } from './find-defects.ts';
import { readCommits } from './read-commits.ts';
import { renderDetails } from './render-details.ts';
import { loadTemplatesWithTaxonomy } from './templates.ts';
import type {
  AmendEntryOutcome,
  CheckMergeBodyOutcome,
  ConsolidateBranchOutcome,
  ConsolidateEntriesOutcome,
  DescribeResult,
  RenderDetailsOutcome,
  RunInput,
} from './types.ts';

/**
 * Amends one change entry in the body file's last `change-record` block and writes the body back to the same file. Only
 * the taxonomy is loaded, which the amended entry is checked against and the block's record is ranked by. The body file
 * is read relative to the invoking directory, and a refused amendment leaves it untouched.
 */
export async function runAmendEntry(
  args: { amendment: EntryAmendment; bodyFile: string; entryIndex: number },
  input: RunInput,
): Promise<DescribeResult> {
  const taxonomy = await loadTaxonomy(input.dataDir);
  if (taxonomy === null) {
    throw new Error(
      `amend-entry checks the amended type against the taxonomy; none is readable ${describeTaxonomyLocation(input.dataDir)}`,
    );
  }
  const resolved = path.resolve(input.cwd, args.bodyFile);
  let body: string;
  try {
    body = await readFile(resolved, 'utf8');
  } catch (error) {
    throw chainError(`--body-file ${resolved} cannot be read`, error);
  }
  const amended = amendEntry({ amendment: args.amendment, body, index: args.entryIndex, taxonomy });
  try {
    await writeFile(resolved, amended.body, 'utf8');
  } catch (error) {
    throw chainError(`--body-file ${resolved} cannot be written`, error);
  }
  const output: AmendEntryOutcome = { entry: amended.entry, entry_count: amended.entryCount };
  return { output, warnings: [] };
}

/**
 * Reads a composed merge body back as release-kit reads the merge commit, refusing a body whose block is malformed, or
 * whose entry count differs from the one expected. An expected count of zero requires that the body not contain a
 * block.
 */
export async function runCheckMergeBody(
  args: { bodyFile: string; entryCount: number },
  input: RunInput,
): Promise<DescribeResult> {
  const resolved = path.resolve(input.cwd, args.bodyFile);
  let body: string;
  try {
    body = await readFile(resolved, 'utf8');
  } catch (error) {
    throw chainError(`--body-file ${resolved} cannot be read`, error);
  }
  const reading = readMergeChangeRecordBlock(body);
  if (reading.kind === 'malformed') {
    throw new Error(`the merge body's change-record block is malformed: ${reading.defect}`);
  }
  if (reading.kind === 'read' && args.entryCount === 0) {
    throw new Error('the merge body contains a change-record block, but the expected entry count is 0');
  }
  const found = reading.kind === 'absent' ? 0 : reading.block.entries.length;
  if (found !== args.entryCount) {
    throw new Error(`the merge body records ${found} change entries; expected ${args.entryCount}`);
  }
  const output: CheckMergeBodyOutcome = { entry_count: found };
  return { output, warnings: [] };
}

/**
 * Reads a range's commits and consolidates them, in the shape named by the JSON output. Each entry is rendered back
 * through the template that read it, so its `change` is canonical whatever subject it came from.
 */
export async function runConsolidateBranch(baseRef: string, input: RunInput): Promise<DescribeResult> {
  const { projectRoot, taxonomy, templates, warnings } = await loadTemplatesWithTaxonomy(
    input,
    'consolidate-branch ranks types against the taxonomy',
  );
  if (templates.commit === '') {
    throw new Error('commit.title_format is empty, so a branch’s commits cannot be read back');
  }
  const commits = await readCommits({ baseRef, cwd: projectRoot, git: input.git });
  const nodes = compileTemplate(templates.commit);
  const consolidation = consolidateBranch(commits, nodes, taxonomy);
  const { consolidatedRecord } = consolidation;

  const output: ConsolidateBranchOutcome = {
    entries: consolidation.entries.map((entry) => ({
      breaking: entry.record.breaking === true,
      change: render(nodes, entry.record),
      commit: entry.commit,
      scope: entry.record.scope ?? null,
      title: entry.record.title ?? null,
      type: entry.record.type ?? null,
    })),
    consolidated_record:
      consolidatedRecord === undefined
        ? { breaking: null, scope: null, type: null }
        : {
            breaking: consolidatedRecord.breaking === true,
            scope: consolidatedRecord.scope ?? null,
            type: consolidatedRecord.type ?? null,
          },
    unmatched: consolidation.unmatched,
    violations: consolidation.violations,
  };
  return { output, warnings };
}

/**
 * Consolidates a change's entries into the record that represents the change, and reports each entry whose type or
 * breaking marker the taxonomy does not accept. Only the taxonomy is loaded, so the run does not read a title template or
 * the repository. An empty list determines nothing, as a branch without a commit entry does.
 */
export async function runConsolidateEntries(entriesFile: string, input: RunInput): Promise<DescribeResult> {
  const taxonomy = await loadTaxonomy(input.dataDir);
  if (taxonomy === null) {
    throw new Error(
      `consolidate-entries ranks types against the taxonomy; none is readable ${describeTaxonomyLocation(input.dataDir)}`,
    );
  }
  const entries = await readEntriesFile({ cwd: input.cwd, filePath: entriesFile });
  const consolidated = consolidateChangeEntries(entries, taxonomy);
  const output: ConsolidateEntriesOutcome = {
    consolidated_record:
      entries.length === 0
        ? { breaking: null, scope: null, type: null }
        : {
            breaking: consolidated.breaking === true,
            scope: consolidated.scope ?? null,
            type: consolidated.type ?? null,
          },
    defects: findEntryDefects(entries, taxonomy),
  };
  return { output, warnings: [] };
}

/**
 * Renders the block from the invocation, reading the entries from their file when one is named. The run consolidates
 * nothing and does not read the taxonomy, so a defective template does not stop it; the record is what the flags pass.
 */
export async function runRenderBlock(
  args: { block: ChangeRecordBlock; entriesFile?: string },
  input: RunInput,
): Promise<DescribeResult> {
  const entries =
    args.entriesFile === undefined ? [] : await readEntriesFile({ cwd: input.cwd, filePath: args.entriesFile });
  const block = { ...args.block, ...(entries.length > 0 && { entries }) };
  return { output: { block: renderChangeRecordBlock(block) }, warnings: [] };
}

/**
 * Renders the `## Details` body from the entries file, refusing when the taxonomy that orders and heads the
 * subsections cannot be read or lacks a heading.
 */
export async function runRenderDetails(entriesFile: string, input: RunInput): Promise<DescribeResult> {
  const taxonomy = await loadTaxonomy(input.dataDir);
  const headings = await loadWorkTypeHeadings(input.dataDir);
  if (taxonomy === null) {
    throw new Error(
      `render-details orders and heads the entries by the taxonomy; none is readable ${describeTaxonomyLocation(input.dataDir)}`,
    );
  }
  if (headings === null) {
    throw new Error(
      `render-details heads the entries by the taxonomy; the one ${describeTaxonomyLocation(input.dataDir)} lacks an \`emoji\` or \`label\` for \`markers.breaking\` or a type`,
    );
  }
  const entries = await readEntriesFile({ cwd: input.cwd, filePath: entriesFile });
  const output: RenderDetailsOutcome = { details: renderDetails(entries, taxonomy, headings) };
  return { output, warnings: [] };
}

// region | Helpers

/**
 * Reads the entries that a YAML file declares, refusing a file that cannot be read, cannot be parsed, or is malformed,
 * including one in which a comment cuts an entry's text short.
 */
async function readEntriesFile(input: { cwd: string; filePath: string }): Promise<ChangeEntry[]> {
  const resolved = path.resolve(input.cwd, input.filePath);
  let text: string;
  try {
    text = await readFile(resolved, 'utf8');
  } catch (error) {
    throw chainError(`--entries-file ${resolved} cannot be read`, error);
  }
  const document = parseDocument(text);
  const [error] = document.errors;
  if (error !== undefined) {
    throw chainError(`--entries-file ${resolved} is not valid YAML`, error);
  }
  const comment = findEntryComment(document.contents);
  if (comment !== undefined) {
    throw new Error(`--entries-file ${resolved} is malformed: ${comment.defect}`);
  }
  const read = readChangeEntries(document.toJS());
  if ('defect' in read) {
    throw new Error(`--entries-file ${resolved} is malformed: ${read.defect}`);
  }
  return read.entries;
}

// endregion | Helpers
