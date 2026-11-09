import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runCheckCoverageCommand } from './check-coverage-command.ts';
import { runConvertCommand } from './convert-command.ts';
import { findPackageRoot, readPackageVersion } from './find-package-root.ts';

/** What a CLI invocation writes to each stream and the code with which it exits. */
export interface CommandOutput {
  exitCode: number;
  stderr: string;
  stdout: string;
}

const USAGE = `Usage: agent-logic <command> [arguments]

Commands:
  convert         convert a draft of a prompt's logic into an agent-logic config
  check-coverage  check a coverage map of a prompt against the prompt
  rules           print the extraction rules by which a model drafts a prompt's logic

Run agent-logic <command> --help for a command's arguments and options.

Options:
  -h, --help     print this help
  -V, --version  print the version
`;

/** Dispatches the bin's arguments to a command and returns its output without touching the process. */
export function run(argv: readonly string[]): CommandOutput {
  const [command, ...args] = argv;
  switch (command) {
    case undefined:
    case '--help':
    case '-h':
      return { exitCode: 0, stderr: '', stdout: USAGE };
    case '--version':
    case '-V':
      return { exitCode: 0, stderr: '', stdout: `${readPackageVersion()}\n` };
    case 'check-coverage':
      return runCheckCoverageCommand(args);
    case 'convert':
      return runConvertCommand(args);
    case 'rules':
      return runRulesCommand(args);
    default:
      return { exitCode: 2, stderr: `agent-logic: unknown command: ${command}\n\n${USAGE}`, stdout: '' };
  }
}

// region | Helpers
const RULES_HELP = `Prints the extraction rules by which a model drafts a prompt's logic for agent-logic convert.

Usage: agent-logic rules

Options:
  -h, --help  print this help
`;

/** Prints the extraction rules that the package ships, or this command's help. */
function runRulesCommand(args: readonly string[]): CommandOutput {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    return { exitCode: 0, stderr: '', stdout: RULES_HELP };
  }
  if (args.length > 0) {
    return {
      exitCode: 2,
      stderr: `agent-logic rules: expected no arguments, received ${args.length}; run agent-logic rules --help for usage\n`,
      stdout: '',
    };
  }
  return {
    exitCode: 0,
    stderr: '',
    stdout: readFileSync(path.join(findPackageRoot(), 'docs/extraction-rules.md'), 'utf8'),
  };
}
// endregion | Helpers
