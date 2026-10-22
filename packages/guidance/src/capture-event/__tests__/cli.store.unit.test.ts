import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeBodyStream } from '../../test-utils/make-body-stream.ts';
import { runCapture } from '../cli.ts';
import { makeStore, makeStoreDir } from '../test-utils/make-store.ts';
import { NO_REMOTE_GIT } from '../test-utils/no-remote-git.ts';
import { NOW } from '../test-utils/now.ts';

describe(runCapture, () => {
  it('writes to the registered store, not a .kb in cwd, when capturing from a directory containing one', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const cwdWithKb = await mkdtemp(join(tmpdir(), 'capture-cli-cwdkb-'));
    await mkdir(join(cwdWithKb, '.kb'), { recursive: true });

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'codeassembly', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: cwdWithKb,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.path.startsWith(storePath)).toBe(true);
    const cwdEntries = await readdir(cwdWithKb);
    expect(cwdEntries).not.toContain('content');
  });

  it('fails when the named store is not registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-empty-'));

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'missing', '--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('store-not-registered');
    }
  });

  it('writes to the --store override, not the configured default_kb', async () => {
    const defaultStore = await makeStoreDir();
    const namedStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-twostore-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: fallback\nkbs:\n  fallback:\n    path: ${defaultStore}\n  named:\n    path: ${namedStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'named', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: '/tmp/elsewhere',
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.store).toBe('named');
    expect(result.path.startsWith(namedStore)).toBe(true);
  });

  it('fails with missing-store, listing the non-default store and marking the registry default', async () => {
    const defaultStore = await makeStoreDir();
    const otherStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-missingstore-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: primary\nkbs:\n  primary:\n    path: ${defaultStore}\n  secondary:\n    path: ${otherStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('missing-store');
    expect(result.message).toContain('secondary');
    expect(result.message).toContain('default is "primary"');
    expect(result.message).toContain('--store @default');
  });

  it('fails with no-default-store when --store @default is given but default_kb is not configured', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-nodefault-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(join(home, '.agents', 'kb.yaml'), 'kbs:\n  codeassembly:\n    path: /tmp/whatever\n', 'utf8');

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@default', '--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-default-store');
    }
  });

  it('writes to the feedback_kb, not the default_kb, when --store @feedback is given', async () => {
    const defaultStore = await makeStoreDir();
    const feedbackStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-feedback-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: personal\nfeedback_kb: guidance\nkbs:\n  guidance:\n    path: ${feedbackStore}\n  personal:\n    path: ${defaultStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@feedback', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.store).toBe('guidance');
    expect(result.path.startsWith(feedbackStore)).toBe(true);
  });

  it('fails with no-feedback-store naming the key when --store @feedback is given but feedback_kb is not configured', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@feedback', '--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('no-feedback-store');
    expect(result.message).toBe('--store @feedback was given but kb.yaml does not configure feedback_kb');
  });

  it('fails with missing-store, naming both role sentinels when both roles are configured', async () => {
    const defaultStore = await makeStoreDir();
    const feedbackStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-missingroles-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: personal\nfeedback_kb: guidance\nkbs:\n  guidance:\n    path: ${feedbackStore}\n  personal:\n    path: ${defaultStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.message).toContain('the registry default is "personal", available as --store @default');
    expect(result.message).toContain('the feedback store is "guidance", available as --store @feedback');
  });

  it('names the registry-load cause when --store names a registered store but default_kb is unresolvable', async () => {
    const storePath = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-poisoned-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: ghost\nkbs:\n  realstore:\n    path: ${storePath}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'realstore', '--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('store-not-registered');
    expect(result.message).toMatch(/default_kb "ghost" does not match any registered KB/);
  });
});
