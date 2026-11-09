import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { convertPrompt } from '../convert/convert-prompt.ts';
import { readPackageVersion } from './find-package-root.ts';
import type { CommandOutput } from './run.ts';

const PROGRAM = 'agent-logic convert';

const HELP = `Converts a draft of an agent prompt's logic into an agent-logic config.

Usage: ${PROGRAM} [options] <prompt-file> <draft-file> <output-file>

Arguments:
  prompt-file   the prompt, read verbatim
  draft-file    the draft JSON, whose shape the package exports as draftSchema
  output-file   where to write the config; written only when the config is valid

A draft of { "outOfScope": { "reason": "..." } } reports that the prompt is out of
scope: nothing is written to output-file.

Options:
  --problems-file <file>  on a problem, write { "problems": [...] } to this file; on success, delete it
  -h, --help              print this help
  -V, --version           print the version

Exit codes:
  0  the config was written
  1  the draft has problems; correct them and run again
  2  the arguments or files are wrong
  3  the draft reports the prompt out of scope; the problems file contains the draft

Example:
  ${PROGRAM} prompts/refund-request.md "$TMPDIR/draft.json" prompts/refund-request.agent-logic.json
`;

/** Runs `agent-logic convert`: converts a draft of a prompt's logic into a config and writes it. */
export function runConvertCommand(args: readonly string[]): CommandOutput {
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
        'problems-file': { type: 'string' },
        version: { type: 'boolean', short: 'V' },
      },
    });
  } catch (error) {
    const reason = describeError(error);
    stderr.push(`${PROGRAM}: ${reason}; run ${PROGRAM} --help for usage\n`);
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

  const [promptFile, draftFile, outputFile, ...extra] = parsed.positionals;
  if (promptFile === undefined || draftFile === undefined || outputFile === undefined || extra.length > 0) {
    stderr.push(
      `${PROGRAM}: expected 3 arguments, received ${parsed.positionals.length}; run ${PROGRAM} --help for usage\n`,
    );
    return 2;
  }

  let prompt: string;
  let draftText: string;
  try {
    prompt = readFileSync(promptFile, 'utf8');
    draftText = readFileSync(draftFile, 'utf8');
  } catch (error) {
    const reason = describeError(error);
    stderr.push(`${PROGRAM}: ${reason}; pass the path of an existing file\n`);
    return 2;
  }

  const result = convertPrompt(prompt, draftText, promptFile);
  const problemsFile = parsed.values['problems-file'];
  if ('outOfScope' in result) {
    const text = `${JSON.stringify({ outOfScope: result.outOfScope }, undefined, 2)}\n`;
    if (problemsFile !== undefined && !runFileOperation(() => writeFileSync(problemsFile, text), stderr)) return 2;
    stderr.push(
      `${PROGRAM}: the prompt is out of scope: ${result.outOfScope.reason}\n`,
      `${PROGRAM}: wrote no config\n`,
    );
    return 3;
  }
  if (!result.ok) {
    const text = `${JSON.stringify({ problems: result.problems }, undefined, 2)}\n`;
    if (problemsFile !== undefined && !runFileOperation(() => writeFileSync(problemsFile, text), stderr)) return 2;
    for (const { path: problemPath, message } of result.problems) {
      stderr.push(`${PROGRAM}: ${problemPath === '' ? '' : `${problemPath}: `}${message}\n`);
    }
    stderr.push(`${PROGRAM}: wrote nothing; correct the draft, then run ${PROGRAM} again\n`);
    return 1;
  }

  if (!runFileOperation(() => writeFileSync(outputFile, result.text), stderr)) return 2;
  if (problemsFile !== undefined && !runFileOperation(() => rmSync(problemsFile, { force: true }), stderr)) return 2;
  stdout.push(`${PROGRAM}: wrote ${outputFile}\n`);
  return 0;
}

/** Runs a file operation and returns whether it succeeded, reporting a failure as an argument error. */
function runFileOperation(operation: () => void, stderr: string[]): boolean {
  try {
    operation();
    return true;
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}; pass a path in a directory that exists and is writable\n`);
    return false;
  }
}
// endregion | Helpers
