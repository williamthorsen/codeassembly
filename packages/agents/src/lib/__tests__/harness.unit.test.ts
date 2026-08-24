import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectHarnesses, HARNESSES, resolveAmbientHostPath, resolveHarnessPaths } from '../harness.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe('harness', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-harness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe(detectHarnesses, () => {
    it('should return empty array when no harness directories exist', () => {
      const result = detectHarnesses(tempDir);
      expect(result).toEqual([]);
    });

    it('should detect only claude when .claude directory exists', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });

      const result = detectHarnesses(tempDir);
      expect(result).toEqual(['claude']);
    });

    it('should detect only rovo when the rovo home directory exists', async () => {
      await mkdir(path.join(tempDir, ROVO_HOME), { recursive: true });

      const result = detectHarnesses(tempDir);
      expect(result).toEqual(['rovo']);
    });

    it('should detect both harnesses when both directories exist', async () => {
      await mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await mkdir(path.join(tempDir, ROVO_HOME), { recursive: true });

      const result = detectHarnesses(tempDir);
      expect(result).toEqual(['claude', 'rovo']);
    });
  });

  describe(resolveAmbientHostPath, () => {
    it('should resolve the harness-home host to the guidance file under the harness home', () => {
      expect(resolveAmbientHostPath('claude', 'harness-home', tempDir)).toBe(
        path.join(tempDir, '.claude', 'CLAUDE.md'),
      );
      expect(resolveAmbientHostPath('rovo', 'harness-home', tempDir)).toBe(path.join(tempDir, ROVO_HOME, 'AGENTS.md'));
    });

    it('should resolve the project-local host to the machine-local file at the base, not under the harness home', () => {
      expect(resolveAmbientHostPath('claude', 'project-local', tempDir)).toBe(path.join(tempDir, 'CLAUDE.local.md'));
      expect(resolveAmbientHostPath('rovo', 'project-local', tempDir)).toBe(path.join(tempDir, 'AGENTS.local.md'));
    });

    it('should give every harness a local guidance filename distinct from its harness-home one', () => {
      for (const config of Object.values(HARNESSES)) {
        expect(config.localGuidanceFileName).not.toBe(config.guidanceFileName);
        expect(config.localGuidanceFileName).toMatch(/\.local\.md$/);
      }
    });
  });

  describe(resolveHarnessPaths, () => {
    it('should resolve correct paths for claude harness', () => {
      const result = resolveHarnessPaths('claude', tempDir);

      expect(result.harnessHome).toBe(path.join(tempDir, HARNESSES.claude.homeDir));
      expect(result.skillsDir).toBe(path.join(tempDir, HARNESSES.claude.homeDir, HARNESSES.claude.skillsDirName));
      expect(result.subagentsDir).toBe(path.join(tempDir, HARNESSES.claude.homeDir, HARNESSES.claude.subagentsDirName));
      expect(result.scriptsDir).toBe(path.join(tempDir, HARNESSES.claude.homeDir, HARNESSES.claude.scriptsDirName));
    });

    it('should resolve correct paths for rovo harness', () => {
      const result = resolveHarnessPaths('rovo', tempDir);

      expect(result.harnessHome).toBe(path.join(tempDir, HARNESSES.rovo.homeDir));
      expect(result.skillsDir).toBe(path.join(tempDir, HARNESSES.rovo.homeDir, HARNESSES.rovo.skillsDirName));
      expect(result.subagentsDir).toBe(path.join(tempDir, HARNESSES.rovo.homeDir, HARNESSES.rovo.subagentsDirName));
      expect(result.scriptsDir).toBe(path.join(tempDir, HARNESSES.rovo.homeDir, HARNESSES.rovo.scriptsDirName));
    });

    it('should produce absolute paths containing the harness home directory', () => {
      const result = resolveHarnessPaths('claude', tempDir);

      expect(result.skillsDir.startsWith(result.harnessHome)).toBe(true);
      expect(result.subagentsDir.startsWith(result.harnessHome)).toBe(true);
      expect(result.scriptsDir.startsWith(result.harnessHome)).toBe(true);
    });
  });

  describe('HARNESSES invocation sigils', () => {
    it('should render the skill sigil per harness', () => {
      expect(HARNESSES.claude.skillSigil).toBe('/');
      expect(HARNESSES.rovo.skillSigil).toBe('!');
    });

    it('should leave the subagent sigil empty on both current harnesses', () => {
      expect(HARNESSES.claude.subagentSigil).toBe('');
      expect(HARNESSES.rovo.subagentSigil).toBe('');
    });

    it('should supply both sigils for every harness id', () => {
      for (const config of Object.values(HARNESSES)) {
        expect(typeof config.skillSigil).toBe('string');
        expect(typeof config.subagentSigil).toBe('string');
      }
    });
  });
});
