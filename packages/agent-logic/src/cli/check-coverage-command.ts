import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { checkCoverage, describeBlock } from '../coverage-map/check-coverage.ts';
import { coverageMapSchema } from '../coverage-map/coverage-map-schema.ts';
import { readPackageVersion } from './find-package-root.ts';
import type { CommandOutput } from './run.ts';

const PROGRAM = 'agent-logic check-coverage';

const HELP = `Lists the parts of a prompt that a coverage map does not quote.

Usage: ${PROGRAM} [options] <prompt-file> <map-file>

Arguments:
  prompt-file   the prompt, read verbatim
  map-file      the coverage map JSON, whose shape the package exports as coverageMapSchema

Each paragraph, list item, table body row, and fenced block of the prompt, outside HTML
comments, must overlap the quote of some map entry; each quote must occur in the prompt
exactly once. Each problem is one line on stdout:
  line <N>: <opening words>               a block that no quote overlaps
  map[<i>]: "<quote>" occurs <K> times    a quote that does not occur exactly once
  map<path>: <message>                    an entry that does not match the schema

Options:
  -h, --help     print this help
  -V, --version  print the version

Exit codes:
  0  every block is mapped
  1  the map has problems; correct them and run again
  2  the arguments or files are wrong

Example:
  ${PROGRAM} prompts/refund-request.md "$TMPDIR/refund-request.coverage-map.json"
`;

/** Runs `agent-logic check-coverage`: checks a coverage map against its prompt. */
export function runCheckCoverageCommand(args: readonly string[]): CommandOutput {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = runCli(args, stdout, stderr);
  return { exitCode, stderr: stderr.join(''), stdout: stdout.join('') };
}

// region | Helpers
/** Reads the arguments, does the work, and returns the exit code, collecting what it writes. */
function runCli(args: readonly string[], stdout: string[], stderr: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
      },
    });
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}; run ${PROGRAM} --help for usage\n`);
    return 2;
  }

  if (parsed.values.help === true) {
    stdout.push(HELP);
    return 0;
  }
  if (parsed.values.version === true) {
    stdout.push(`${readPackageVersion()}\n`);
    return 0;
  }

  const [promptFile, mapFile, ...extra] = parsed.positionals;
  if (promptFile === undefined || mapFile === undefined || extra.length > 0) {
    stderr.push(
      `${PROGRAM}: expected 2 arguments, received ${parsed.positionals.length}; run ${PROGRAM} --help for usage\n`,
    );
    return 2;
  }

  let prompt: string;
  let mapBody: unknown;
  try {
    prompt = readFileSync(promptFile, 'utf8');
    mapBody = JSON.parse(readFileSync(mapFile, 'utf8'));
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}; pass the paths of existing files, the map as JSON\n`);
    return 2;
  }

  const map = coverageMapSchema.safeParse(mapBody);
  if (!map.success) {
    for (const issue of map.error.issues) {
      const issuePath = issue.path.map((key) => (typeof key === 'number' ? `[${key}]` : `.${String(key)}`)).join('');
      stdout.push(`map${issuePath}: ${issue.message}\n`);
    }
    return 1;
  }

  const { unmapped, quoteProblems } = checkCoverage(prompt, map.data);
  for (const { index, quote, occurrences } of quoteProblems) {
    stdout.push(`map[${index}]: ${JSON.stringify(quote)} occurs ${occurrences} times\n`);
  }
  for (const block of unmapped) {
    stdout.push(`line ${block.line}: ${describeBlock(prompt, block)}\n`);
  }
  if (unmapped.length > 0 || quoteProblems.length > 0) return 1;

  stdout.push(`${PROGRAM}: every block is mapped\n`);
  return 0;
}
// endregion | Helpers
