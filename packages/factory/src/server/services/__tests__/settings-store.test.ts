import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { silencedConsole } from '../../../test-utils.js';
import { SettingsStore } from '../settings-store.js';

describe('SettingsStore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `settings-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getFilePath', () => {
    it('reflects constructor argument', () => {
      const store = new SettingsStore('/custom/path');
      expect(store.getFilePath()).toBe('/custom/path/settings.json');
    });

    it('uses FACTORY_SETTINGS_PATH env var when no constructor argument is given', () => {
      const original = process.env.FACTORY_SETTINGS_PATH;
      try {
        process.env.FACTORY_SETTINGS_PATH = '/from/env';
        const store = new SettingsStore();
        expect(store.getFilePath()).toBe('/from/env/settings.json');
      } finally {
        if (original === undefined) {
          delete process.env.FACTORY_SETTINGS_PATH;
        } else {
          process.env.FACTORY_SETTINGS_PATH = original;
        }
      }
    });

    it('falls back to default path when no constructor argument or env var is set', () => {
      const original = process.env.FACTORY_SETTINGS_PATH;
      try {
        delete process.env.FACTORY_SETTINGS_PATH;
        const store = new SettingsStore();
        expect(store.getFilePath()).toMatch(/\.config\/codeassembly\/factory\/settings\.json$/);
      } finally {
        if (original !== undefined) {
          process.env.FACTORY_SETTINGS_PATH = original;
        }
      }
    });
  });

  describe('load', () => {
    it('returns default settings when file is absent', async () => {
      const store = new SettingsStore(tempDir);
      const settings = await store.load();
      expect(settings).toEqual({ dismissedRuns: {} });
    });

    it('returns persisted settings when file exists', async () => {
      const store = new SettingsStore(tempDir);
      await store.save({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });

      const settings = await store.load();
      expect(settings).toEqual({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });
    });

    it('returns defaults for invalid JSON', async () => {
      using _silent = silencedConsole(['error']);
      const store = new SettingsStore(tempDir);
      // Write valid first to create the directory, then overwrite with invalid JSON
      await store.save({ dismissedRuns: {} });
      const { writeFile: write } = await import('node:fs/promises');
      await write(store.getFilePath(), 'not valid json', 'utf8');

      const settings = await store.load();
      expect(settings).toEqual({ dismissedRuns: {} });
    });

    it('returns defaults for invalid schema', async () => {
      using _silent = silencedConsole(['error']);
      const store = new SettingsStore(tempDir);
      await store.save({ dismissedRuns: {} });
      const { writeFile: write } = await import('node:fs/promises');
      await write(store.getFilePath(), JSON.stringify({ unexpected: true }), 'utf8');

      const settings = await store.load();
      expect(settings).toEqual({ dismissedRuns: {} });
    });
  });

  describe('save', () => {
    it('writes valid JSON and creates parent directories', async () => {
      const nestedDir = join(tempDir, 'nested', 'deep');
      const store = new SettingsStore(nestedDir);
      const data = { dismissedRuns: { 'x/y/z': { status: 'failed' } } };

      await store.save(data);

      const raw = await readFile(store.getFilePath(), 'utf8');
      expect(JSON.parse(raw)).toEqual(data);
    });

    it('overwrites existing settings file', async () => {
      const store = new SettingsStore(tempDir);
      await store.save({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });
      await store.save({ dismissedRuns: { 'd/e/f': { status: 'failed' } } });

      const settings = await store.load();
      expect(settings).toEqual({ dismissedRuns: { 'd/e/f': { status: 'failed' } } });
    });
  });

  describe('patch', () => {
    it('replaces dismissedRuns with the provided value and persists', async () => {
      const store = new SettingsStore(tempDir);
      await store.save({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });

      // The client always sends its full local state, so the server replaces the entire key.
      const merged = await store.patch({ dismissedRuns: { 'd/e/f': { status: 'failed' } } });

      expect(merged).toEqual({ dismissedRuns: { 'd/e/f': { status: 'failed' } } });

      // Verify persistence
      const loaded = await store.load();
      expect(loaded).toEqual(merged);
    });

    it('preserves existing settings when patching with empty object', async () => {
      const store = new SettingsStore(tempDir);
      await store.save({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });

      const merged = await store.patch({});

      expect(merged).toEqual({ dismissedRuns: { 'a/b/c': { status: 'completed' } } });

      const loaded = await store.load();
      expect(loaded).toEqual(merged);
    });

    it('works when no file exists yet', async () => {
      const store = new SettingsStore(tempDir);

      const merged = await store.patch({ dismissedRuns: { 'x/y/z': { status: 'in_progress' } } });

      expect(merged).toEqual({ dismissedRuns: { 'x/y/z': { status: 'in_progress' } } });
    });
  });
});
