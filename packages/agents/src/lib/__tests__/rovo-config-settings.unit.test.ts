import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../harness.ts';
import type { HookEntry, HookSentinelMatcher } from '../rovo-config-hooks.ts';
import { checkRovoHookEntries, ensureRovoHookEntries, removeRovoHookEntries } from '../rovo-config-settings.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

/** A test sentinel: ownership is marked by a `--ca` token in any command. */
const isOwned: HookSentinelMatcher = (entry) => entry.commands.some((command) => command.includes('--ca'));

/** Builds an owned entry for the named hook event, carrying the sentinel token. */
function buildOwnedEntry(name: string): HookEntry {
  return { name, commands: [`run ${name} --ca`] };
}

describe('rovo-config-settings', () => {
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

  it('creates the file and its parent directory on first ensure', async () => {
    const result = await ensureRovoHookEntries(configPath, [buildOwnedEntry('on_session_start')], isOwned);

    expect(result.changed).toBe(true);
    expect(await readFile(configPath, 'utf8')).toContain('run on_session_start --ca');
  });

  it('leaves the file untouched on an unchanged re-run', async () => {
    await ensureRovoHookEntries(configPath, [buildOwnedEntry('on_session_start')], isOwned);
    const written = await readFile(configPath, 'utf8');

    const rerun = await ensureRovoHookEntries(configPath, [buildOwnedEntry('on_session_start')], isOwned);

    expect(rerun.changed).toBe(false);
    expect(await readFile(configPath, 'utf8')).toBe(written);
  });

  it('preserves foreign entries, comments, and unrelated keys across a round trip', async () => {
    await mkdir(path.dirname(configPath), { recursive: true });
    const source = [
      '# my config',
      'otherKey: 42',
      'eventHooks:',
      `  logFile: "~/${ROVO_HOME}/event_hooks.log"`,
      '  events:',
      '    - name: on_complete # foreign',
      '      commands:',
      "        - command: echo 'done'",
      '',
    ].join('\n');
    await writeFile(configPath, source, 'utf8');

    await ensureRovoHookEntries(configPath, [buildOwnedEntry('on_session_end')], isOwned);
    const out = await readFile(configPath, 'utf8');

    expect(out).toContain('# my config');
    expect(out).toContain('otherKey: 42');
    expect(out).toContain('logFile:');
    expect(out).toContain('on_complete # foreign');
    expect(out).toContain("echo 'done'");
    expect(out).toContain('run on_session_end --ca');
  });

  it('writes a long command as a single unfolded line', async () => {
    const longCommand = `run on_session_start --with-a-flag-long-enough-to-cross-the-default-fold-width --and-then-some --ca`;
    await ensureRovoHookEntries(configPath, [{ name: 'on_session_start', commands: [longCommand] }], isOwned);

    expect(await readFile(configPath, 'utf8')).toContain(`- command: ${longCommand}\n`);
  });

  it('reports every entry absent for a missing file, without creating it', async () => {
    const checks = await checkRovoHookEntries(configPath, [buildOwnedEntry('on_session_start')], isOwned);

    expect(checks.map((check) => check.status)).toEqual(['absent']);
    expect(existsSync(configPath)).toBe(false);
  });

  it('round-trips ensure, check, and remove against one file', async () => {
    const entries = [buildOwnedEntry('on_session_start'), buildOwnedEntry('on_session_end')];
    await ensureRovoHookEntries(configPath, entries, isOwned);

    const checks = await checkRovoHookEntries(configPath, entries, isOwned);
    expect(checks.map((check) => check.status)).toEqual(['present', 'present']);

    const removal = await removeRovoHookEntries(configPath, isOwned);
    expect(removal).toEqual({ changed: true, removedCount: 2 });
    expect(await readFile(configPath, 'utf8')).not.toContain('--ca');
  });

  it('does not create a missing file on remove', async () => {
    const result = await removeRovoHookEntries(configPath, isOwned);

    expect(result).toEqual({ changed: false, removedCount: 0 });
    expect(existsSync(configPath)).toBe(false);
  });

  it('surfaces a parse failure naming the file, and never writes', async () => {
    await mkdir(path.dirname(configPath), { recursive: true });
    const broken = 'eventHooks: [unterminated\n';
    await writeFile(configPath, broken, 'utf8');

    await expect(ensureRovoHookEntries(configPath, [buildOwnedEntry('on_session_start')], isOwned)).rejects.toThrow(
      configPath,
    );
    expect(await readFile(configPath, 'utf8')).toBe(broken);
  });
});
