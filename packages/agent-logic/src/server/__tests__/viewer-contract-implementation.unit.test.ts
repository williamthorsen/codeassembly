import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStateStore, type RunOutcome, type StateStore } from '@williamthorsen/telefactor/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import type { ViewerSettingsResult } from '../create-prompts-app.ts';
import { MAX_PROMPT_FILE_BYTES } from '../prompt-directory.ts';
import { createViewerContractImplementation } from '../viewer-contract-implementation.ts';

describe(createViewerContractImplementation, () => {
  let root = '';
  let directory = '';
  let store: StateStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'viewer-contract-'));
    directory = path.join(root, 'prompts');
    await mkdir(directory);
    store = createStateStore(createViewerContractImplementation({ readSettings: () => Promise.resolve(settings()) }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('save_prompt', () => {
    it('writes the prompt under its sanitized name and records its path', async () => {
      const outcome = await run('save_prompt', { name: 'Refund triage', text: 'Triage refunds.' });

      const savedPath = path.join(directory, 'refund-triage.md');
      expect(readState(outcome)).toMatchObject({ savedPrompt: { fileName: 'refund-triage.md', path: savedPath } });
      expect(await readFile(savedPath, 'utf8')).toBe('Triage refunds.');
    });

    it('refuses a name that a saved prompt already uses, leaving the file as it was', async () => {
      await writeFile(path.join(directory, 'refund.txt'), 'Original.');

      const outcome = await run('save_prompt', { name: 'refund', text: 'Replacement.' });

      expect(readFailure(outcome)).toContain('already has files named refund');
      expect(await readFile(path.join(directory, 'refund.txt'), 'utf8')).toBe('Original.');
    });

    it('refuses a name that an agent-logic file uses, which converting the prompt would overwrite', async () => {
      await writeFile(path.join(directory, 'refund.agent-logic.json'), '{}');

      const outcome = await run('save_prompt', { name: 'refund', text: 'Refund the order.' });

      expect(readFailure(outcome)).toContain('already has files named refund');
      expect(existsSync(path.join(directory, 'refund.md'))).toBe(false);
    });

    it('refuses an empty name', async () => {
      expect(readFailure(await run('save_prompt', { name: '  ', text: 'Text.' }))).toContain('Enter a name');
    });

    it('refuses a name without an ASCII letter or digit, which leaves nothing to name the file by', async () => {
      expect(readFailure(await run('save_prompt', { name: '日本語', text: 'Text.' }))).toContain(
        'a letter from a to z or a digit',
      );
    });

    it('refuses a prompt that the directory could not read back', async () => {
      const outcome = await run('save_prompt', { name: 'big', text: 'x'.repeat(MAX_PROMPT_FILE_BYTES + 1) });

      expect(readFailure(outcome)).toContain('larger than 1 MiB');
    });
  });

  describe('load_chart', () => {
    it('loads a listed agent-logic file, labelled as the saved file, and clears the selection', async () => {
      await writeFile(path.join(directory, 'greeter.agent-logic.json'), JSON.stringify(buildMinimalConfig()));
      await run('show_chart', minimalChart());
      await run('select_element', { path: 'states.greeting' });

      const state = readState(await run('load_chart', { fileName: 'greeter.agent-logic.json' }));

      expect(state).toMatchObject({
        chart: { source: 'File: greeter.agent-logic.json', downloadName: 'greeter.agent-logic.json' },
      });
      expect(state).toMatchObject({ selectedPath: undefined });
    });

    it('refuses a file that the directory does not list', async () => {
      const outcome = await run('load_chart', { fileName: '../outside.agent-logic.json' });

      expect(readFailure(outcome)).toContain('does not list ../outside.agent-logic.json');
    });

    it('refuses a file that does not validate, naming its problems', async () => {
      await writeFile(path.join(directory, 'broken.agent-logic.json'), JSON.stringify({ id: 'agent' }));

      const outcome = await run('load_chart', { fileName: 'broken.agent-logic.json' });

      expect(readFailure(outcome)).toContain('broken.agent-logic.json is not a valid agent-logic file');
    });
  });

  describe('select_element', () => {
    it('selects an element of the loaded chart and clears the selection when the path is omitted', async () => {
      await run('show_chart', minimalChart());

      expect(readState(await run('select_element', { path: 'states.greeting' }))).toMatchObject({
        selectedPath: 'states.greeting',
      });
      expect(readState(await run('select_element', {}))).toMatchObject({ selectedPath: undefined });
    });

    it('refuses a path that the chart does not contain', async () => {
      await run('show_chart', minimalChart());

      expect(readFailure(await run('select_element', { path: 'states.missing' }))).toContain(
        'does not contain an element at states.missing',
      );
    });

    it('refuses a path while no chart is loaded', async () => {
      expect(readFailure(await run('select_element', { path: 'states.greeting' }))).toContain('No chart is loaded');
    });
  });

  function run(name: string, input: unknown): Promise<RunOutcome> {
    return store.run(name, input, 'agent');
  }

  function settings(): ViewerSettingsResult {
    return {
      ok: true,
      configPath: path.join(root, 'harness.config.json'),
      source: 'file',
      hasConfigFile: true,
      settings: {
        default: 'echo',
        timeoutMinutes: 2,
        harnesses: { echo: { command: ['echo'] } },
        app: { promptsDirectory: 'prompts' },
      },
    };
  }
});

// region | Helpers
/** Returns a chart of the minimal config, as the page publishes it. */
function minimalChart(): { source: string; downloadName: string; config: ReturnType<typeof buildMinimalConfig> } {
  return { source: 'Pasted JSON', downloadName: 'pasted.agent-logic.json', config: buildMinimalConfig() };
}

/** Returns the message of a refused call. */
function readFailure(outcome: RunOutcome): string {
  if (outcome.ok) throw new Error('Expected the call to be refused.');
  return JSON.stringify(outcome);
}

/** Returns the committed state of a call that succeeded. */
function readState(outcome: RunOutcome): unknown {
  if (!outcome.ok) throw new Error(`Expected the call to commit: ${JSON.stringify(outcome)}`);
  return outcome.snapshot.state;
}
// endregion | Helpers
