import { type FSWatcher, watch } from 'node:fs';

import type { ProjectIndex } from '../../shared/types/api.ts';

export interface Scannable {
  scan(): Promise<ProjectIndex>;
  getBasePath(): string;
}

const DEBOUNCE_MS = 1_000;

export class ProjectWatcher {
  private scanner: Scannable;
  private watcher: FSWatcher | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(scanner: Scannable) {
    this.scanner = scanner;
  }

  start(): void {
    if (this.watcher !== undefined) return;

    const basePath = this.scanner.getBasePath();

    // Note: recursive fs.watch is well-supported on macOS/Windows but not on Linux.
    this.watcher = watch(basePath, { recursive: true }, () => {
      this.scheduleRescan();
    });

    this.watcher.on('error', (error) => {
      console.error('File watcher error:', error);
    });

    console.info(`Watching ${basePath} for changes`);
  }

  stop(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.watcher !== undefined) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  private async rescan(): Promise<void> {
    this.debounceTimer = undefined;
    console.info('File change detected, rescanning projects...');
    try {
      await this.scanner.scan();
    } catch (error: unknown) {
      console.error('Error during rescan:', error);
    }
  }

  private scheduleRescan(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.rescan();
    }, DEBOUNCE_MS);
  }
}
