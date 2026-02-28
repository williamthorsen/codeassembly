import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { UserSettings } from '../../shared/types/settings.js';
import { userSettingsSchema } from '../adapters/schemas/settings-schema.js';
import { isEnoent } from '../type-guards.js';

const DEFAULT_SETTINGS: UserSettings = { dismissedRuns: {} };

export class SettingsStore {
  private filePath: string;

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
      if (isEnoent(error)) return { ...DEFAULT_SETTINGS };
      console.warn('Failed to read settings file, using defaults:', error);
      return { ...DEFAULT_SETTINGS };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('Settings file contains invalid JSON, using defaults');
      return { ...DEFAULT_SETTINGS };
    }

    const result = userSettingsSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('Settings file failed schema validation, using defaults:', result.error.issues);
      return { ...DEFAULT_SETTINGS };
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
    await rename(tmpPath, this.filePath);
  }

  async patch(partial: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.load();
    const merged: UserSettings = { ...current, ...partial };
    await this.save(merged);
    return merged;
  }
}
