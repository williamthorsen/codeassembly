/** Runs `gh` in `cwd` and resolves with its stdout, rejecting when the command fails. */
export type CommandRunner = (command: 'gh', args: readonly string[], cwd: string) => Promise<string>;
