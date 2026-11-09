/**
 * Stands in for a harness command in tests and smoke runs. The first argument chooses what it does:
 *
 * - `write <source> <output>`: copies the source file to the output path and exits 0.
 * - `fail <message>`: writes the message to stderr and exits 3.
 * - `hang <pid-file>`: starts a child that runs until killed, writes `<own pid> <child pid>` to the pid file, and runs
 *   until killed.
 * - `say <message>`: writes the message to stdout and exits 0 without writing a file.
 * - `silent`: exits 0 without writing anything.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);

if (mode === 'write' && args[0] !== undefined && args[1] !== undefined) {
  copyFileSync(args[0], args[1]);
} else if (mode === 'fail') {
  process.stderr.write(`${args.join(' ')}\n`);
  process.exitCode = 3;
} else if (mode === 'say') {
  process.stdout.write(`${args.join(' ')}\n`);
} else if (mode === 'hang' && args[0] !== undefined) {
  const { pid } = spawn(process.execPath, ['--eval', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(args[0], `${process.pid} ${pid ?? ''}`);
  setInterval(() => {}, 1000);
} else if (mode !== 'silent') {
  process.stderr.write(`fake-harness: unknown arguments: ${process.argv.slice(2).join(' ')}\n`);
  process.exitCode = 2;
}
