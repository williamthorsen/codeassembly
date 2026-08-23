import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HOOK_SENTINEL } from '../../lib/hook-entry-catalog.ts';
import {
  checkHarnessHookEntries,
  configureHooksCommand,
  ensureHarnessHookEntries,
  removeHarnessHookEntries,
  renderClaudeHookSnippet,
  renderRovoHookSnippet,
} from '../configure-hooks.ts';

/** The package README, whose manual-adoption snippets must be exactly what the render functions emit. */
const README_PATH = fileURLToPath(new URL('../../../README.md', import.meta.url));

/** Extracts the contents of the first fenced code block of `language` after `heading`, without the fences. */
async function readReadmeSnippet(heading: string, language: string): Promise<string> {
  const readme = await readFile(README_PATH, 'utf8');
  const section = readme.slice(readme.indexOf(heading));
  const fence = `\`\`\`${language}\n`;
  const start = section.indexOf(fence) + fence.length;
  const end = section.indexOf('```', start);
  return section.slice(start, end);
}

describe('configure-hooks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `configure-hooks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe(configureHooksCommand, () => {
    it('writes the hook entries into both harness configs', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await mkdir(path.join(tempDir, '.rovodev'), { recursive: true });

      await configureHooksCommand({ harness: 'all' }, tempDir);

      const settings = await readFile(path.join(tempDir, '.claude', 'settings.json'), 'utf8');
      const config = await readFile(path.join(tempDir, '.rovodev', 'config.yml'), 'utf8');
      expect(settings).toContain(HOOK_SENTINEL);
      expect(settings).toContain('SessionStart');
      expect(config).toContain(HOOK_SENTINEL);
      expect(config).toContain('on_session_start');
    });

    it('prints snippets for every harness when no harness home exists', async () => {
      using silent = silenceConsole(['info']);
      await configureHooksCommand({ harness: 'all', print: true }, tempDir);
      const output = silent.info.mock.calls.map((call) => String(call[0])).join('\n');

      expect(output).toContain('"SessionStart"');
      expect(output).toContain('on_session_start');
      expect(existsSync(path.join(tempDir, '.claude'))).toBe(false);
      expect(existsSync(path.join(tempDir, '.rovodev'))).toBe(false);
    });

    it('fails loudly when run standalone against an unparseable config', async () => {
      const settingsPath = path.join(tempDir, '.claude', 'settings.json');
      await mkdir(path.dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, '{ not json', 'utf8');

      await expect(configureHooksCommand({ harness: 'claude' }, tempDir)).rejects.toThrow(/Cannot parse/);
    });

    it('writes nothing in print mode', async () => {
      using silent = silenceConsole(['info']);
      await configureHooksCommand({ harness: 'claude', print: true }, tempDir);
      const output = silent.info.mock.calls.map((call) => String(call[0])).join('\n');

      expect(existsSync(path.join(tempDir, '.claude', 'settings.json'))).toBe(false);
      expect(output).toContain('"SessionStart"');
      expect(output).toContain(HOOK_SENTINEL);
    });
  });

  describe(ensureHarnessHookEntries, () => {
    it('is idempotent per harness', async () => {
      await ensureHarnessHookEntries('claude', tempDir);
      const first = await readFile(path.join(tempDir, '.claude', 'settings.json'), 'utf8');

      await ensureHarnessHookEntries('claude', tempDir);

      expect(await readFile(path.join(tempDir, '.claude', 'settings.json'), 'utf8')).toBe(first);
    });

    it('preserves foreign hook entries and unrelated settings keys', async () => {
      const settingsPath = path.join(tempDir, '.claude', 'settings.json');
      await mkdir(path.dirname(settingsPath), { recursive: true });
      const existing = {
        model: 'opus',
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard.sh' }] }] },
      };
      await writeFile(settingsPath, `${JSON.stringify(existing, undefined, 2)}\n`, 'utf8');

      await ensureHarnessHookEntries('claude', tempDir);

      const settings = await readFile(settingsPath, 'utf8');
      expect(settings).toContain('"model": "opus"');
      expect(settings).toContain('my-guard.sh');
      expect(settings).toContain(HOOK_SENTINEL);
    });
  });

  describe(checkHarnessHookEntries, () => {
    it('reports absent before configuration and present after, for both harnesses', async () => {
      expect((await checkHarnessHookEntries('claude', tempDir)).every((entry) => entry.status === 'absent')).toBe(true);
      expect((await checkHarnessHookEntries('rovo', tempDir)).every((entry) => entry.status === 'absent')).toBe(true);

      await ensureHarnessHookEntries('claude', tempDir);
      await ensureHarnessHookEntries('rovo', tempDir);

      const claudeChecks = await checkHarnessHookEntries('claude', tempDir);
      const rovoChecks = await checkHarnessHookEntries('rovo', tempDir);
      expect(claudeChecks).toHaveLength(4);
      expect(rovoChecks).toHaveLength(4);
      expect(claudeChecks.every((entry) => entry.status === 'present')).toBe(true);
      expect(rovoChecks.every((entry) => entry.status === 'present')).toBe(true);
    });
  });

  describe(removeHarnessHookEntries, () => {
    it('removes only sentinel-marked entries, leaving foreign content intact', async () => {
      const configPath = path.join(tempDir, '.rovodev', 'config.yml');
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(
        configPath,
        [
          'eventHooks:',
          '  events:',
          '    - name: on_complete',
          '      commands:',
          '        - command: echo done',
          '',
        ].join('\n'),
        'utf8',
      );
      await ensureHarnessHookEntries('rovo', tempDir);

      await removeHarnessHookEntries('rovo', tempDir);

      const config = await readFile(configPath, 'utf8');
      expect(config).toContain('echo done');
      expect(config).not.toContain(HOOK_SENTINEL);
    });
  });

  describe('README parity', () => {
    it('documents the Claude snippet exactly as rendered', async () => {
      const snippet = await readReadmeSnippet('### Claude Code', 'json');

      expect(snippet.trimEnd()).toBe(renderClaudeHookSnippet().trimEnd());
    });

    it('documents the Rovo snippet exactly as rendered for the placeholder home', async () => {
      const snippet = await readReadmeSnippet('### Rovo Dev', 'yaml');

      expect(snippet.trimEnd()).toBe(renderRovoHookSnippet('/Users/you/.rovodev/scripts').trimEnd());
    });
  });
});
