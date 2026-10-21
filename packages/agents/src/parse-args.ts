/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import process from 'node:process';

import { ALL_HARNESS_IDS } from './lib/harness.ts';
import type { HarnessId, InstallOptions } from './lib/types.ts';

const HARNESS_ARG_VALUES: ReadonlyArray<string> = [...ALL_HARNESS_IDS, 'all'];

/** Widened to `string` so that an arbitrary value tests without a type assertion. */
const VALID_HARNESS_IDS: ReadonlySet<string> = new Set(HARNESS_ARG_VALUES);

export const HARNESS_ARG_LIST = HARNESS_ARG_VALUES.join(', ');

/** Parses CLI arguments into a structured options object. */
export function parseArgs(argv: ReadonlyArray<string>): {
  command: string;
  subcommand: string;
  options: InstallOptions;
  check: boolean;
  content: string | undefined;
  help: boolean;
  global: boolean;
  warnOnly: boolean;
} {
  const args = argv.slice(2);
  let command = '';
  let subcommand = '';
  let check = false;
  let content: string | undefined;
  let harness: InstallOptions['harness'] = 'all';
  let link = false;
  let force = false;
  let dryRun = false;
  let help = false;
  let global = false;
  let warnOnly = false;
  let shouldOverrideWriter = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    const flag = parseFlag(arg);
    switch (flag) {
      case 'check':
        check = true;
        break;
      case 'help':
        help = true;
        break;
      case 'link':
        link = true;
        break;
      case 'force':
        force = true;
        break;
      case 'dry-run':
        dryRun = true;
        break;
      case 'global':
        global = true;
        break;
      case 'override-writer':
        shouldOverrideWriter = true;
        break;
      case 'warn-only':
        warnOnly = true;
        break;
      case 'content': {
        const result = parseValueArg(args, i, '--content', '<dir>');
        content = result.value;
        i = result.nextIndex;
        break;
      }
      case 'output-style':
        // `configureStreamStyles` has already validated the value; only the spaced form consumes the next argument.
        if (!arg.includes('=')) i = parseValueArg(args, i, '--output-style', 'auto, plain, rich').nextIndex;
        break;
      case 'harness': {
        const result = parseHarnessArg(args, i);
        harness = result.harness;
        i = result.nextIndex;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option "${arg}"`);
          process.exit(1);
        } else if (!command) {
          command = arg;
        } else if (!subcommand) {
          subcommand = arg;
        }
    }
  }

  return {
    command,
    subcommand,
    options: { harness, link, force, dryRun, shouldOverrideWriter },
    check,
    content,
    help,
    global,
    warnOnly,
  };
}

// region | Helpers

/** Reports whether `value` names a harness or `all`. */
function isValidHarness(value: string): value is HarnessId | 'all' {
  return VALID_HARNESS_IDS.has(value);
}

type FlagName =
  | 'check'
  | 'content'
  | 'dry-run'
  | 'force'
  | 'global'
  | 'harness'
  | 'help'
  | 'link'
  | 'output-style'
  | 'override-writer'
  | 'warn-only';

/** Maps an argument to the flag that it names, or `null` when it does not name one. */
function parseFlag(arg: string): FlagName | null {
  if (arg.startsWith('--output-style=')) return 'output-style';
  const flags: Record<string, FlagName> = {
    '--help': 'help',
    '-h': 'help',
    '--link': 'link',
    '--force': 'force',
    '--dry-run': 'dry-run',
    '--global': 'global',
    '--override-writer': 'override-writer',
    '--warn-only': 'warn-only',
    '--check': 'check',
    '--content': 'content',
    '--harness': 'harness',
    '--output-style': 'output-style',
  };
  return flags[arg] ?? null;
}

/** Reads the `--harness` value, exiting with the valid options when it does not name a harness. */
function parseHarnessArg(
  args: ReadonlyArray<string>,
  index: number,
): { harness: HarnessId | 'all'; nextIndex: number } {
  const { value, nextIndex } = parseValueArg(args, index, '--harness', HARNESS_ARG_LIST);
  if (!isValidHarness(value)) {
    console.error(`Error: Invalid harness "${value}". Valid options: ${HARNESS_ARG_LIST}`);
    process.exit(1);
  }
  return { harness: value, nextIndex };
}

/** Reads the value following a value-taking flag, exiting with an attributed error when the flag stands alone. */
function parseValueArg(
  args: ReadonlyArray<string>,
  index: number,
  flag: string,
  expected: string,
): { value: string; nextIndex: number } {
  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    console.error(`Error: ${flag} requires a value (${expected})`);
    process.exit(1);
  }
  return { value: nextArg, nextIndex: index + 1 };
}

// endregion | Helpers
