/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { homedir } from 'node:os';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { realGit } from './git.ts';
import { parseArgs, PROGRAM } from './parse-args.ts';
import {
  runAmendEntry,
  runCheckMergeBody,
  runConsolidateBranch,
  runConsolidateEntries,
  runRenderBlock,
  runRenderDetails,
} from './run-entry-commands.ts';
import { applyProjectRoot } from './run-project-root.ts';
import {
  runResolveEffectiveRecord,
  runResolveLabels,
  runResolveMerge,
  runResolveScopes,
  runResolveTicketType,
} from './run-resolve-commands.ts';
import { runParseTitle, runRenderTitles } from './run-title-commands.ts';
import type { DescribeInput, DescribeResult, RunInput } from './types.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const { output, warnings } = await runDescribe({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      home: homedir(),
    });
    for (const warning of warnings) {
      process.stderr.write(`${PROGRAM}: ${warning}\n`);
    }
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, PROGRAM)) {
  await main();
}

/**
 * Runs the helper end to end: parses the arguments, then dispatches to the subcommand that they name.
 *
 * A subcommand loads its own inputs and nothing else, so a defect affects only the subcommands that read it. A
 * subcommand refuses when an input that it loads fails. Two exceptions warn and continue instead: the project-root
 * resolution, which reads `cwd`, and `render-titles`, which renders without a taxonomy and from unverified templates.
 *
 * @internal - Exported to allow testing.
 */
export async function runDescribe(input: DescribeInput): Promise<DescribeResult> {
  const args = parseArgs(input.argv);
  const run: RunInput = { ...input, git: input.git ?? realGit };
  switch (args.subcommand) {
    case 'amend-entry':
      return runAmendEntry(args, run);
    case 'check-merge-body':
      return runCheckMergeBody(args, run);
    case 'consolidate-branch':
      return runConsolidateBranch(args.baseRef, run);
    case 'consolidate-entries':
      return runConsolidateEntries(args.entriesFile, run);
    case 'parse-title':
      return runParseTitle(args.surface, args.subject, run);
    case 'render-block':
      return runRenderBlock(args, run);
    case 'render-details':
      return runRenderDetails(args.entriesFile, run);
    case 'render-titles':
      return runRenderTitles(args.record, await applyProjectRoot(run, args.projectRoot));
    case 'resolve-effective-record':
      return runResolveEffectiveRecord(args, run);
    case 'resolve-labels':
      return runResolveLabels(args, await applyProjectRoot(run, args.projectRoot));
    case 'resolve-merge':
      return runResolveMerge(args.merge, run);
    case 'resolve-scopes':
      return runResolveScopes(args.paths, run);
    case 'resolve-ticket-type':
      return runResolveTicketType(args.ticketLabels, run);
  }
}
