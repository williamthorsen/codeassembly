import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../harness.ts';
import type { HookSentinelMatcher } from '../rovo-config-hooks.ts';
import { removeRovoHookEntries } from '../rovo-config-settings.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

/** A test sentinel: Ownership is marked by a `--ca` token in any command. */
const isOwned: HookSentinelMatcher = (entry) => entry.commands.some((command) => command.includes('--ca'));

describe(removeRovoHookEntries, () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `rovo-config-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    configPath = path.join(tempDir, ROVO_HOME, 'config.yml');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('deletes owned entries across events and writes foreign entries, comments, and keys back unchanged', async () => {
    const source = [
      '# my config',
      'otherKey: 42',
      'eventHooks:',
      `  logFile: "~/${ROVO_HOME}/event_hooks.log"`,
      '  events:',
      '    - name: on_complete # foreign',
      '      commands:',
      "        - command: echo 'done'",
      '    - name: on_session_start',
      '      commands:',
      '        - command: run on_session_start --ca',
      '    - name: on_session_end',
      '      commands:',
      '        - command: run on_session_end --ca',
      '',
    ].join('\n');
    await writeConfig(source);

    const result = await removeRovoHookEntries(configPath, isOwned);

    expect(result).toEqual({ changed: true, removedCount: 2 });
    expect(await readFile(configPath, 'utf8')).toBe(
      [
        '# my config',
        'otherKey: 42',
        'eventHooks:',
        `  logFile: "~/${ROVO_HOME}/event_hooks.log"`,
        '  events:',
        '    - name: on_complete # foreign',
        '      commands:',
        "        - command: echo 'done'",
        '',
      ].join('\n'),
    );
  });

  it('writes a long foreign command back as a single unfolded line', async () => {
    const longCommand =
      'run on_session_start --with-a-flag-long-enough-to-cross-the-default-fold-width --and-then-some';
    const source = [
      'eventHooks:',
      '  events:',
      '    - name: on_session_start',
      '      commands:',
      `        - command: ${longCommand}`,
      '    - name: on_session_end',
      '      commands:',
      '        - command: run on_session_end --ca',
      '',
    ].join('\n');
    await writeConfig(source);

    await removeRovoHookEntries(configPath, isOwned);

    expect(await readFile(configPath, 'utf8')).toContain(`- command: ${longCommand}\n`);
  });

  it('reports the owned entries under dryRun without writing the file', async () => {
    const source = [
      'eventHooks:',
      '  events:',
      '    - name: on_session_start',
      '      commands:',
      '        - command: run on_session_start --ca',
      '',
    ].join('\n');
    await writeConfig(source);

    const result = await removeRovoHookEntries(configPath, isOwned, { dryRun: true });

    expect(result).toEqual({ changed: true, removedCount: 1 });
    expect(await readFile(configPath, 'utf8')).toBe(source);
  });

  it('does not create a missing file', async () => {
    const result = await removeRovoHookEntries(configPath, isOwned);

    expect(result).toEqual({ changed: false, removedCount: 0 });
    expect(existsSync(configPath)).toBe(false);
  });

  it('reports a parse failure naming the file, and never writes', async () => {
    const broken = 'eventHooks: [unterminated\n';
    await writeConfig(broken);

    await expect(removeRovoHookEntries(configPath, isOwned)).rejects.toThrow(configPath);
    expect(await readFile(configPath, 'utf8')).toBe(broken);
  });

  // region | Helpers

  /** Writes fixture text to the config path, creating its parent directory. */
  async function writeConfig(text: string): Promise<void> {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, text, 'utf8');
  }

  // endregion | Helpers
});
