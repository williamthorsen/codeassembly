import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClaudeHookEntry } from '../claude-hook-entries.ts';
import { checkClaudeHookEntries, ensureClaudeHookEntries, removeClaudeHookEntries } from '../claude-hook-settings.ts';

const SENTINEL = 'codeassembly:hook';
const GROUP = { matcher: 'Bash', hooks: [{ type: 'command', command: `${SENTINEL} relay` }] };
const ENTRY: ClaudeHookEntry = { event: 'PreToolUse', group: GROUP };

/** Invalid JSON — a trailing comma — as a hand-edited settings file might well hold. */
const UNPARSEABLE = '{\n  "model": "opus",\n}\n';

let dir: string;

beforeEach(async () => {
  dir = path.join(tmpdir(), `agents-test-hook-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe(checkClaudeHookEntries, () => {
  it('reports every entry absent when the file does not exist', async () => {
    const checks = await checkClaudeHookEntries(path.join(dir, 'absent.json'), [ENTRY], SENTINEL);

    expect(checks).toEqual([{ entry: ENTRY, status: 'absent' }]);
  });

  it('reports the entry present once ensure has installed it', async () => {
    const file = path.join(dir, 'settings.json');
    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect(await checkClaudeHookEntries(file, [ENTRY], SENTINEL)).toEqual([{ entry: ENTRY, status: 'present' }]);
  });

  it('reports the entry drifted when the installed command differs', async () => {
    const drifted = { matcher: 'Bash', hooks: [{ type: 'command', command: `${SENTINEL} relay --old` }] };
    const file = await writeSettings(`${JSON.stringify({ hooks: { PreToolUse: [drifted] } }, undefined, 2)}\n`);

    expect(await checkClaudeHookEntries(file, [ENTRY], SENTINEL)).toEqual([{ entry: ENTRY, status: 'drifted' }]);
  });
});

describe(ensureClaudeHookEntries, () => {
  it('creates the file and its parent directory when absent', async () => {
    const file = path.join(dir, 'nested', 'settings.json');

    const result = await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect(result).toEqual({ changed: true });
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify({ hooks: { PreToolUse: [GROUP] } }, undefined, 2)}\n`);
  });

  it('does not rewrite the file when the entry is already installed', async () => {
    const file = path.join(dir, 'settings.json');
    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);
    const firstMtime = statSync(file).mtimeMs;

    const result = await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect(result).toEqual({ changed: false });
    expect(statSync(file).mtimeMs).toBe(firstMtime);
  });

  it.each([
    { name: 'tab', unit: '\t' },
    { name: 'two-space', unit: '  ' },
    { name: 'four-space', unit: '    ' },
  ])('preserves $name indentation', async ({ unit }) => {
    const file = await writeSettings(`{\n${unit}"model": "opus"\n}\n`);

    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    const updated = await readFile(file, 'utf8');
    expect(updated).toContain(`\n${unit}"hooks": {`);
    expect(updated).toContain(`\n${unit}${unit}"PreToolUse": [`);
  });

  it.each([
    { name: 'keeps the trailing newline when the file ends in one', text: '{\n  "model": "opus"\n}\n', ends: true },
    { name: 'adds no trailing newline when the file ends without one', text: '{\n  "model": "opus"\n}', ends: false },
  ])('$name', async ({ text, ends }) => {
    const file = await writeSettings(text);

    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect((await readFile(file, 'utf8')).endsWith('\n')).toBe(ends);
  });

  it('keeps a single-line file on one line', async () => {
    const file = await writeSettings('{"model":"opus"}');

    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect(await readFile(file, 'utf8')).toBe(JSON.stringify({ model: 'opus', hooks: { PreToolUse: [GROUP] } }));
  });

  it.each([
    { name: 'an empty document', text: '{}\n' },
    { name: 'an empty document spanning lines', text: '{\n}\n' },
  ])('gives $name the same formatting as a missing file', async ({ text }) => {
    const file = await writeSettings(text);

    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify({ hooks: { PreToolUse: [GROUP] } }, undefined, 2)}\n`);
  });

  it('expands inline arrays and objects onto separate lines', async () => {
    const file = await writeSettings('{\n  "permissions": { "allow": ["Bash"] }\n}\n');

    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    // Line-breaking is not recoverable from the file text the way the indent unit is, so re-serializing expands what
    // was written inline. The indent unit and the values themselves survive.
    const updated = await readFile(file, 'utf8');
    expect(updated).toContain('  "permissions": {\n    "allow": [\n      "Bash"\n    ]\n  }');
    expect(JSON.parse(updated)).toMatchObject({ permissions: { allow: ['Bash'] } });
  });

  it('leaves foreign entries and unrelated keys in the written file', async () => {
    const foreign = { matcher: 'Write', hooks: [{ type: 'command', command: 'echo foreign' }] };
    const original = { permissions: { allow: ['Bash'] }, hooks: { PreToolUse: [foreign] } };
    const file = await writeSettings(`${JSON.stringify(original, undefined, 2)}\n`);

    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      permissions: { allow: ['Bash'] },
      hooks: { PreToolUse: [foreign, GROUP] },
    });
  });

  it('updates the target of a symlinked settings file without replacing the link', async () => {
    const target = path.join(dir, 'dotfiles', 'settings.json');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '{}\n', 'utf8');
    const link = path.join(dir, 'settings.json');
    await symlink(target, link);

    await ensureClaudeHookEntries(link, [ENTRY], SENTINEL);

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toContain(SENTINEL);
  });

  it('creates no file when a supplied entry does not carry the sentinel', async () => {
    const file = path.join(dir, 'settings.json');
    const unmarked: ClaudeHookEntry = { event: 'PreToolUse', group: { hooks: [{ command: 'echo hi' }] } };

    await expect(ensureClaudeHookEntries(file, [unmarked], SENTINEL)).rejects.toThrow(/sentinel/);
    expect(existsSync(file)).toBe(false);
  });
});

describe(removeClaudeHookEntries, () => {
  it('restores the file to its pre-ensure bytes', async () => {
    const original = '{\n\t"model": "opus"\n}\n';
    const file = await writeSettings(original);
    await ensureClaudeHookEntries(file, [ENTRY], SENTINEL);

    const result = await removeClaudeHookEntries(file, SENTINEL);

    expect(result).toEqual({ changed: true, removedCount: 1 });
    expect(await readFile(file, 'utf8')).toBe(original);
  });

  it('creates no file when the settings file does not exist', async () => {
    const file = path.join(dir, 'absent.json');

    expect(await removeClaudeHookEntries(file, SENTINEL)).toEqual({ changed: false, removedCount: 0 });
    expect(existsSync(file)).toBe(false);
  });

  it('does not rewrite a file holding no owned entry', async () => {
    const file = await writeSettings('{\n  "model": "opus"\n}\n');
    const firstMtime = statSync(file).mtimeMs;

    const result = await removeClaudeHookEntries(file, SENTINEL);

    expect(result).toEqual({ changed: false, removedCount: 0 });
    expect(statSync(file).mtimeMs).toBe(firstMtime);
  });
});

describe('an unparseable settings file', () => {
  it.each([
    { name: 'check', run: async (file: string) => checkClaudeHookEntries(file, [ENTRY], SENTINEL) },
    { name: 'ensure', run: async (file: string) => ensureClaudeHookEntries(file, [ENTRY], SENTINEL) },
    { name: 'remove', run: async (file: string) => removeClaudeHookEntries(file, SENTINEL) },
  ])('is named in the failure and left byte-identical when $name runs', async ({ run }) => {
    const file = await writeSettings(UNPARSEABLE);

    await expect(run(file)).rejects.toThrow(`Cannot parse ${file}`);
    expect(await readFile(file, 'utf8')).toBe(UNPARSEABLE);
  });
});

// region | Helpers

/** Writes fixture text to the temp directory's settings file and returns its path. */
async function writeSettings(text: string): Promise<string> {
  const file = path.join(dir, 'settings.json');
  await writeFile(file, text, 'utf8');
  return file;
}

// endregion | Helpers
