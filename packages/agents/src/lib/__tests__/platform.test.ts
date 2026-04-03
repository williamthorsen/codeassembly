import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectPlatforms, PLATFORMS, resolvePlatformPaths } from '../platform.js';

describe('platform', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-platform-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('detectPlatforms', () => {
    it('should return empty array when no platform directories exist', () => {
      const result = detectPlatforms(tempDir);
      expect(result).toEqual([]);
    });

    it('should detect only claude when .claude directory exists', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });

      const result = detectPlatforms(tempDir);
      expect(result).toEqual(['claude']);
    });

    it('should detect only rovodev when .rovodev directory exists', async () => {
      await mkdir(path.join(tempDir, '.rovodev'), { recursive: true });

      const result = detectPlatforms(tempDir);
      expect(result).toEqual(['rovodev']);
    });

    it('should detect both platforms when both directories exist', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await mkdir(path.join(tempDir, '.rovodev'), { recursive: true });

      const result = detectPlatforms(tempDir);
      expect(result).toEqual(['claude', 'rovodev']);
    });
  });

  describe('resolvePlatformPaths', () => {
    it('should resolve correct paths for claude platform', () => {
      const result = resolvePlatformPaths('claude', tempDir);

      expect(result.platformHome).toBe(path.join(tempDir, PLATFORMS.claude.homeDir));
      expect(result.skillsDir).toBe(path.join(tempDir, PLATFORMS.claude.homeDir, PLATFORMS.claude.skillsDir));
      expect(result.subagentsDir).toBe(path.join(tempDir, PLATFORMS.claude.homeDir, PLATFORMS.claude.subagentsDir));
      expect(result.scriptsDir).toBe(path.join(tempDir, PLATFORMS.claude.homeDir, PLATFORMS.claude.scriptsDir));
    });

    it('should resolve correct paths for rovodev platform', () => {
      const result = resolvePlatformPaths('rovodev', tempDir);

      expect(result.platformHome).toBe(path.join(tempDir, PLATFORMS.rovodev.homeDir));
      expect(result.skillsDir).toBe(path.join(tempDir, PLATFORMS.rovodev.homeDir, PLATFORMS.rovodev.skillsDir));
      expect(result.subagentsDir).toBe(path.join(tempDir, PLATFORMS.rovodev.homeDir, PLATFORMS.rovodev.subagentsDir));
      expect(result.scriptsDir).toBe(path.join(tempDir, PLATFORMS.rovodev.homeDir, PLATFORMS.rovodev.scriptsDir));
    });

    it('should produce absolute paths containing the platform home directory', () => {
      const result = resolvePlatformPaths('claude', tempDir);

      expect(result.skillsDir.startsWith(result.platformHome)).toBe(true);
      expect(result.subagentsDir.startsWith(result.platformHome)).toBe(true);
      expect(result.scriptsDir.startsWith(result.platformHome)).toBe(true);
    });
  });
});
