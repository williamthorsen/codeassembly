import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { UserSettings } from '../../shared/types/settings.js';
import { userSettingsSchema } from '../adapters/schemas/settings-schema.js';
import { isEnoent } from '../type-guards.js';

function defaultSettings(): UserSettings {
  return { dismissedRuns: {} };
}

export class SettingsStore {
  private readonly filePath: string;

  constructor(dirPath?: string) {
    const dir = dirPath ?? process.env.FACTORY_SETTINGS_PATH ?? join(homedir(), '.config', 'codeassembly', 'factory');
    this.filePath = join(dir, 'settings.json');
  }

  getFilePath(): string {
    return this.filePath;
  }

  async load(): Promise<UserSettings> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error: unknown) {
      if (isEnoent(error)) return defaultSettings();
      console.warn('Failed to read settings file, using defaults:', error);
      return defaultSettings();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('Settings file contains invalid JSON, using defaults');
      return defaultSettings();
    }

    const result = userSettingsSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('Settings file failed schema validation, using defaults:', result.error.issues);
      return defaultSettings();
    }

    return result.data;
  }

  async save(settings: UserSettings): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf8');

    // rename() is atomic when source and destination are on the same filesystem.
    // If FACTORY_SETTINGS_PATH points to a different volume, rename() will throw EXDEV.
    try {
      await rename(tmpPath, this.filePath);
    } catch (renameError) {
      await unlink(tmpPath).catch(() => {});
      throw renameError;
    }
  }

  async patch(partial: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.load();
    const merged: UserSettings = { ...current, ...partial };
    await this.save(merged);
    return merged;
  }
}
