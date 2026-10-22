/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for the backlog sweep.
 *
 * Seven commands, each printing one JSON result: `collect` selects the open tickets and writes one assessor input file
 * per ticket; `ingest` validates and classifies one assessor reply; `record` appends the skill's decision, policy,
 * note, and pull records; `digest` renders the run's open escalations; `comment` renders one ticket's comment body to a
 * file; `draft` composes one ticket's drafted edit into files; `parent-status` reports whether a merged ticket was its
 * parent's last open child. `ingest` and `record` are the only writers of the ledger.
 *
 * The helper does not write anything remote. The skill posts the comments, edits and creates the tickets, and closes
 * them, which keeps this module testable without a `gh` write.
 */
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type CommandContext, CommandError, type CommandResult } from './command.ts';
import { runCommand } from './fetch.ts';
import { realGit } from './git.ts';
import { parseFlags } from './parse-flags.ts';
import { runCollect } from './run-collect.ts';
import { runIngest, runRecord } from './run-ingest.ts';
import { runComment, runDigest, runDraft, runParentStatus } from './run-report-commands.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const needsStdin = argv[0] === 'ingest' || argv[0] === 'record';
    const result = await runCli(argv, {
      git: realGit,
      now: new Date(),
      root: process.cwd(),
      run: runCommand,
      stdin: needsStdin ? await readStdin() : '',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`groom-backlog: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'groom-backlog')) {
  await main();
}

/**
 * Runs one command. Invalid arguments, an invalid reply or record, a missing reply file, and a failed `gh` or `git`
 * call become structured `{ ok: false }` results.
 */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'collect':
        return await runCollect(flags, context);
      case 'comment':
        return await runComment(flags, context);
      case 'digest':
        return await runDigest(flags, context);
      case 'draft':
        return await runDraft(flags, context);
      case 'ingest':
        return await runIngest(flags, context);
      case 'parent-status':
        return await runParentStatus(flags, context);
      case 'record':
        return await runRecord(flags, context);
      default:
        throw new CommandError(
          'invalid-args',
          `expected a command (collect, comment, digest, draft, ingest, parent-status, record), got "${command ?? ''}"`,
        );
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

// region | Helpers

/** Reads all of stdin as UTF-8. */
async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  // The stream yields `any`, so each chunk is narrowed rather than asserted: A string arrives when an encoding is set.
  for await (const chunk of process.stdin) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  return Buffer.concat(chunks).toString('utf8');
}

// endregion | Helpers
