import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectHarnesses, HARNESSES, resolveHarnessPaths } from '../harness.js';

describe('harness', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-harness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('detectHarnesses', () => {
    it('should return empty array when no harness directories exist', () => {
      const result = detectHarnesses(tempDir);
      expect(result).toEqual([]);
    });

    it('should detect only claude when .claude directory exists', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });

      const result = detectHarnesses(tempDir);
      expect(result).toEqual(['claude']);
    });

    it('should detect only rovodev when .rovodev directory exists', async () => {
      await mkdir(path.join(tempDir, '.rovodev'), { recursive: true });

      const result = detectHarnesses(tempDir);
      expect(result).toEqual(['rovodev']);
    });

    it('should detect both harnesses when both directories exist', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await mkdir(path.join(tempDir, '.rovodev'), { recursive: true });

      const result = detectHarnesses(tempDir);
      expect(result).toEqual(['claude', 'rovodev']);
    });
  });

  describe('resolveHarnessPaths', () => {
    it('should resolve correct paths for claude harness', () => {
      const result = resolveHarnessPaths('claude', tempDir);

      expect(result.harnessHome).toBe(path.join(tempDir, HARNESSES.claude.homeDir));
      expect(result.skillsDir).toBe(path.join(tempDir, HARNESSES.claude.homeDir, HARNESSES.claude.skillsDirName));
      expect(result.subagentsDir).toBe(path.join(tempDir, HARNESSES.claude.homeDir, HARNESSES.claude.subagentsDirName));
      expect(result.scriptsDir).toBe(path.join(tempDir, HARNESSES.claude.homeDir, HARNESSES.claude.scriptsDirName));
    });

    it('should resolve correct paths for rovodev harness', () => {
      const result = resolveHarnessPaths('rovodev', tempDir);

      expect(result.harnessHome).toBe(path.join(tempDir, HARNESSES.rovodev.homeDir));
      expect(result.skillsDir).toBe(path.join(tempDir, HARNESSES.rovodev.homeDir, HARNESSES.rovodev.skillsDirName));
      expect(result.subagentsDir).toBe(
        path.join(tempDir, HARNESSES.rovodev.homeDir, HARNESSES.rovodev.subagentsDirName),
      );
      expect(result.scriptsDir).toBe(path.join(tempDir, HARNESSES.rovodev.homeDir, HARNESSES.rovodev.scriptsDirName));
    });

    it('should produce absolute paths containing the harness home directory', () => {
      const result = resolveHarnessPaths('claude', tempDir);

      expect(result.skillsDir.startsWith(result.harnessHome)).toBe(true);
      expect(result.subagentsDir.startsWith(result.harnessHome)).toBe(true);
      expect(result.scriptsDir.startsWith(result.harnessHome)).toBe(true);
    });
  });
});
