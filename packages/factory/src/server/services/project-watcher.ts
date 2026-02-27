import type { FSWatcher } from 'node:fs';
import { watch } from 'node:fs';

import type { ProjectIndex } from '../../shared/types/api.js';

export interface Scannable {
  scan(): Promise<ProjectIndex>;
  getBasePath(): string;
}

const DEBOUNCE_MS = 1000;

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

  private scheduleRescan(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      console.info('File change detected, rescanning projects...');
      this.scanner.scan().catch((error: unknown) => {
        console.error('Error during rescan:', error);
      });
    }, DEBOUNCE_MS);
  }
}
