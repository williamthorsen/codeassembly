import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeClaudeHookEntries } from '../claude-hook-settings.ts';

const SENTINEL = 'codeassembly:hook';
const OWNED = { matcher: 'Bash', hooks: [{ type: 'command', command: `${SENTINEL} relay` }] };
const FOREIGN = { matcher: 'Write', hooks: [{ type: 'command', command: 'echo foreign' }] };

/** Invalid JSON (a trailing comma), as a hand-edited settings file might well contain. */
const UNPARSEABLE = '{\n  "model": "opus",\n}\n';

/** Per-test scratch directory, refreshed by `beforeEach` so that each test writes into its own. */
const scratch = { dir: '' };

beforeEach(async () => {
  scratch.dir = path.join(tmpdir(), `agents-test-hook-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(scratch.dir, { recursive: true });
});

afterEach(async () => {
  await rm(scratch.dir, { recursive: true, force: true });
});

describe(removeClaudeHookEntries, () => {
  it('deletes owned entries across events and keeps foreign entries and unrelated keys', async () => {
    const original = {
      permissions: { allow: ['Bash'] },
      hooks: { PreToolUse: [FOREIGN, OWNED], Stop: [OWNED] },
    };
    const file = await writeSettings(`${JSON.stringify(original, undefined, 2)}\n`);

    const result = await removeClaudeHookEntries(file, SENTINEL);

    expect(result).toEqual({ changed: true, removedCount: 2 });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      permissions: { allow: ['Bash'] },
      hooks: { PreToolUse: [FOREIGN] },
    });
  });

  it.each([
    { name: 'tab', unit: '\t' },
    { name: 'two-space', unit: '  ' },
    { name: 'four-space', unit: ' '.repeat(4) },
  ])('preserves $name indentation', async ({ unit }) => {
    const file = await writeSettings(
      `${JSON.stringify({ model: 'opus', hooks: { PreToolUse: [FOREIGN, OWNED] } }, undefined, unit)}\n`,
    );

    await removeClaudeHookEntries(file, SENTINEL);

    expect(await readFile(file, 'utf8')).toBe(
      `${JSON.stringify({ model: 'opus', hooks: { PreToolUse: [FOREIGN] } }, undefined, unit)}\n`,
    );
  });

  it.each([
    { name: 'keeps the trailing newline when the file ends in one', ending: '\n' },
    { name: 'does not add a trailing newline when the file ends without one', ending: '' },
  ])('$name', async ({ ending }) => {
    const file = await writeSettings(
      `${JSON.stringify({ model: 'opus', hooks: { PreToolUse: [OWNED] } }, undefined, 2)}${ending}`,
    );

    await removeClaudeHookEntries(file, SENTINEL);

    expect(await readFile(file, 'utf8')).toBe(`{\n  "model": "opus"\n}${ending}`);
  });

  it('keeps a single-line file on one line', async () => {
    const file = await writeSettings(JSON.stringify({ model: 'opus', hooks: { PreToolUse: [OWNED] } }));

    await removeClaudeHookEntries(file, SENTINEL);

    expect(await readFile(file, 'utf8')).toBe('{"model":"opus"}');
  });

  it('expands inline arrays and objects onto separate lines', async () => {
    const owned = JSON.stringify(OWNED);
    const file = await writeSettings(
      `{\n  "permissions": { "allow": ["Bash"] },\n  "hooks": { "PreToolUse": [${owned}] }\n}\n`,
    );

    await removeClaudeHookEntries(file, SENTINEL);

    // Line-breaking is not recoverable from the file text the way the indent unit is, so re-serializing expands what
    // was written inline. The indent unit and the values themselves survive.
    expect(await readFile(file, 'utf8')).toBe('{\n  "permissions": {\n    "allow": [\n      "Bash"\n    ]\n  }\n}\n');
  });

  it('updates the target of a symlinked settings file without replacing the link', async () => {
    const target = path.join(scratch.dir, 'dotfiles', 'settings.json');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify({ hooks: { PreToolUse: [OWNED] } }, undefined, 2)}\n`, 'utf8');
    const link = path.join(scratch.dir, 'settings.json');
    await symlink(target, link);

    await removeClaudeHookEntries(link, SENTINEL);

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('{}\n');
  });

  it('does not create a file when the settings file does not exist', async () => {
    const file = path.join(scratch.dir, 'absent.json');

    expect(await removeClaudeHookEntries(file, SENTINEL)).toEqual({ changed: false, removedCount: 0 });
    expect(existsSync(file)).toBe(false);
  });

  it('does not rewrite a file without an owned entry', async () => {
    const file = await writeSettings('{\n  "model": "opus"\n}\n');
    const firstMtime = statSync(file).mtimeMs;

    const result = await removeClaudeHookEntries(file, SENTINEL);

    expect(result).toEqual({ changed: false, removedCount: 0 });
    expect(statSync(file).mtimeMs).toBe(firstMtime);
  });

  it('names an unparseable file in the failure and leaves it byte-identical', async () => {
    const file = await writeSettings(UNPARSEABLE);

    await expect(removeClaudeHookEntries(file, SENTINEL)).rejects.toThrow(`Cannot parse ${file}`);
    expect(await readFile(file, 'utf8')).toBe(UNPARSEABLE);
  });
});

// region | Helpers

/** Writes fixture text to the temp directory's settings file and returns its path. */
async function writeSettings(text: string): Promise<string> {
  const file = path.join(scratch.dir, 'settings.json');
  await writeFile(file, text, 'utf8');
  return file;
}

// endregion | Helpers
