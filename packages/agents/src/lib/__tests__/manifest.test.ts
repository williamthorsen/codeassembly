import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeContentHash, createEmptyManifest, detectDrift, readManifest, writeManifest } from '../manifest.js';
import type { AgentsManifest, ManifestEntry } from '../types.js';

describe('manifest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readManifest', () => {
    it('should return empty manifest when file does not exist', async () => {
      const manifestPath = path.join(tempDir, 'nonexistent.json');
      const result = await readManifest(manifestPath);
      expect(result).toEqual(createEmptyManifest());
    });

    it('should return empty manifest and warn when file contains invalid schema', async () => {
      const manifestPath = path.join(tempDir, 'bad-schema.json');
      await writeFile(manifestPath, JSON.stringify({ wrong: 'shape' }), 'utf8');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await readManifest(manifestPath);

      expect(result).toEqual(createEmptyManifest());
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('existing manifest is invalid or incompatible'));

      warnSpy.mockRestore();
    });

    it('should reset a pre-rename manifest carrying the legacy `platforms` key', async () => {
      const manifestPath = path.join(tempDir, 'legacy-manifest.json');
      const legacyManifest = {
        schemaVersion: 1,
        platforms: {
          claude: {
            platform: 'claude',
            version: '0.1.0',
            installedAt: '2026-01-01T00:00:00Z',
            entries: [{ relativePath: 'skills/test', contentHash: 'sha256:abc123', linked: false }],
          },
        },
      };
      await writeFile(manifestPath, JSON.stringify(legacyManifest), 'utf8');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await readManifest(manifestPath);

      expect(result).toEqual(createEmptyManifest());
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('existing manifest is invalid or incompatible'));

      warnSpy.mockRestore();
    });

    it('should throw when file contains malformed JSON', async () => {
      const manifestPath = path.join(tempDir, 'malformed.json');
      await writeFile(manifestPath, 'not valid json {{{', 'utf8');

      await expect(readManifest(manifestPath)).rejects.toThrow();
    });

    it('should read a valid manifest file', async () => {
      const manifest: AgentsManifest = {
        schemaVersion: 2,
        harnesses: {
          claude: {
            harness: 'claude',
            version: '0.1.0',
            installedAt: '2026-01-01T00:00:00Z',
            entries: [{ relativePath: 'skills/test', contentHash: 'sha256:abc123', linked: false }],
          },
        },
      };
      const manifestPath = path.join(tempDir, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const result = await readManifest(manifestPath);
      expect(result).toEqual(manifest);
    });
  });

  describe('writeManifest', () => {
    it('should round-trip manifest data', async () => {
      const manifest: AgentsManifest = {
        schemaVersion: 2,
        harnesses: {
          claude: {
            harness: 'claude',
            version: '0.1.0',
            installedAt: '2026-01-01T00:00:00Z',
            entries: [{ relativePath: 'skills/test', contentHash: 'sha256:abc', linked: false }],
          },
        },
      };
      const manifestPath = path.join(tempDir, 'sub', 'manifest.json');
      await writeManifest(manifestPath, manifest);
      const result = await readManifest(manifestPath);
      expect(result).toEqual(manifest);
    });
  });

  describe('computeContentHash', () => {
    it('should return deterministic SHA-256 hash', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await writeFile(filePath, 'hello world', 'utf8');

      const hash1 = await computeContentHash(filePath);
      const hash2 = await computeContentHash(filePath);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different content', async () => {
      const file1 = path.join(tempDir, 'a.txt');
      const file2 = path.join(tempDir, 'b.txt');
      await writeFile(file1, 'content a', 'utf8');
      await writeFile(file2, 'content b', 'utf8');

      const hash1 = await computeContentHash(file1);
      const hash2 = await computeContentHash(file2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('detectDrift', () => {
    it('should return current for unmodified file', async () => {
      const harnessHome = path.join(tempDir, 'harness');
      const skillDir = path.join(harnessHome, 'skills');
      await mkdir(skillDir, { recursive: true });

      const filePath = path.join(skillDir, 'test.md');
      await writeFile(filePath, 'original content', 'utf8');

      const hash = await computeContentHash(filePath);
      const entry: ManifestEntry = {
        relativePath: 'skills/test.md',
        contentHash: hash,
        linked: false,
      };

      const result = await detectDrift(entry, harnessHome);
      expect(result).toBe('current');
    });

    it('should return modified for changed file', async () => {
      const harnessHome = path.join(tempDir, 'harness');
      const skillDir = path.join(harnessHome, 'skills');
      await mkdir(skillDir, { recursive: true });

      const filePath = path.join(skillDir, 'test.md');
      await writeFile(filePath, 'original content', 'utf8');
      const hash = await computeContentHash(filePath);

      // Modify the file
      await writeFile(filePath, 'modified content', 'utf8');

      const entry: ManifestEntry = {
        relativePath: 'skills/test.md',
        contentHash: hash,
        linked: false,
      };

      const result = await detectDrift(entry, harnessHome);
      expect(result).toBe('modified');
    });

    it('should return missing for deleted file', async () => {
      const harnessHome = path.join(tempDir, 'harness');
      const entry: ManifestEntry = {
        relativePath: 'skills/nonexistent.md',
        contentHash: 'sha256:doesnotmatter',
        linked: false,
      };

      const result = await detectDrift(entry, harnessHome);
      expect(result).toBe('missing');
    });

    it('should return current for directory entry when directory exists', async () => {
      const harnessHome = path.join(tempDir, 'harness');
      const dirPath = path.join(harnessHome, 'skills', 'my-skill');
      await mkdir(dirPath, { recursive: true });

      const entry: ManifestEntry = {
        relativePath: 'skills/my-skill',
        contentHash: 'sha256:dir:skills/my-skill',
        linked: false,
      };

      const result = await detectDrift(entry, harnessHome);
      expect(result).toBe('current');
    });

    it('should return modified for directory entry when replaced by a file', async () => {
      const harnessHome = path.join(tempDir, 'harness');
      const filePath = path.join(harnessHome, 'skills', 'my-skill');
      await mkdir(path.join(harnessHome, 'skills'), { recursive: true });
      await writeFile(filePath, 'not a directory', 'utf8');

      const entry: ManifestEntry = {
        relativePath: 'skills/my-skill',
        contentHash: 'sha256:dir:skills/my-skill',
        linked: false,
      };

      const result = await detectDrift(entry, harnessHome);
      expect(result).toBe('modified');
    });
  });
});
