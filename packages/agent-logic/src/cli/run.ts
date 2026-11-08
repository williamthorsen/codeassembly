/** What a CLI invocation writes to each stream and the code with which it exits. */
export interface CommandOutput {
  exitCode: number;
  stderr: string;
  stdout: string;
}

const USAGE = 'Usage: agent-logic <command>\n\nCommands: none yet.\n';

/** Dispatches the bin's arguments to a command and returns its output without touching the process. */
export function run(argv: readonly string[]): CommandOutput {
  const [command] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    return { exitCode: 0, stderr: '', stdout: USAGE };
  }
  return { exitCode: 1, stderr: `agent-logic: unknown command: ${command}\n\n${USAGE}`, stdout: '' };
}
