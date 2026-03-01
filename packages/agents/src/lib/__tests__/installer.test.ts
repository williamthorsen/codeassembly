import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkSymlinkSafety, copyItem, linkItem, removeItem } from '../installer.js';

describe('installer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-installer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('checkSymlinkSafety', () => {
    it('should not throw for a regular directory', () => {
      expect(() => checkSymlinkSafety(tempDir)).not.toThrow();
    });

    it('should not throw for a nonexistent path', () => {
      expect(() => checkSymlinkSafety(path.join(tempDir, 'nonexistent'))).not.toThrow();
    });

    it('should throw for a symlinked directory', async () => {
      const realDir = path.join(tempDir, 'real');
      const symlinkDir = path.join(tempDir, 'link');
      await mkdir(realDir, { recursive: true });
      await symlink(realDir, symlinkDir);

      expect(() => checkSymlinkSafety(symlinkDir)).toThrow('Target directory is a symlink');
    });
  });

  describe('copyItem', () => {
    it('should copy a file', async () => {
      const src = path.join(tempDir, 'src.txt');
      const dest = path.join(tempDir, 'dest', 'copied.txt');
      await writeFile(src, 'hello', 'utf8');

      await copyItem(src, dest);

      const content = await readFile(dest, 'utf8');
      expect(content).toBe('hello');
    });

    it('should copy a directory recursively', async () => {
      const srcDir = path.join(tempDir, 'src-dir');
      const destDir = path.join(tempDir, 'dest-dir');
      await mkdir(path.join(srcDir, 'sub'), { recursive: true });
      await writeFile(path.join(srcDir, 'a.txt'), 'a', 'utf8');
      await writeFile(path.join(srcDir, 'sub', 'b.txt'), 'b', 'utf8');

      await copyItem(srcDir, destDir);

      expect(await readFile(path.join(destDir, 'a.txt'), 'utf8')).toBe('a');
      expect(await readFile(path.join(destDir, 'sub', 'b.txt'), 'utf8')).toBe('b');
    });
  });

  describe('linkItem', () => {
    it('should create a relative symlink', async () => {
      const src = path.join(tempDir, 'src-link');
      const dest = path.join(tempDir, 'dest', 'link');
      await mkdir(src, { recursive: true });
      await writeFile(path.join(src, 'file.txt'), 'content', 'utf8');

      await linkItem(src, dest);

      const stats = lstatSync(dest);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it('should be idempotent when called twice with the same arguments', async () => {
      const src = path.join(tempDir, 'src-idem');
      const dest = path.join(tempDir, 'dest-idem', 'link');
      await mkdir(src, { recursive: true });
      await writeFile(path.join(src, 'file.txt'), 'content', 'utf8');

      await linkItem(src, dest);
      await linkItem(src, dest);

      const stats = lstatSync(dest);
      expect(stats.isSymbolicLink()).toBe(true);
      const target = readlinkSync(dest);
      expect(target).toBe(path.relative(path.dirname(dest), src));
    });

    it('should update symlink when target has changed', async () => {
      const srcA = path.join(tempDir, 'src-a');
      const srcB = path.join(tempDir, 'src-b');
      const dest = path.join(tempDir, 'dest-relink', 'link');
      await mkdir(srcA, { recursive: true });
      await mkdir(srcB, { recursive: true });

      await linkItem(srcA, dest);
      const targetBefore = readlinkSync(dest);
      expect(targetBefore).toBe(path.relative(path.dirname(dest), srcA));

      await linkItem(srcB, dest);
      const targetAfter = readlinkSync(dest);
      expect(targetAfter).toBe(path.relative(path.dirname(dest), srcB));

      const stats = lstatSync(dest);
      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe('removeItem', () => {
    it('should remove a file', async () => {
      const filePath = path.join(tempDir, 'remove-me.txt');
      await writeFile(filePath, 'content', 'utf8');
      expect(existsSync(filePath)).toBe(true);

      await removeItem(filePath);

      expect(existsSync(filePath)).toBe(false);
    });

    it('should remove a directory recursively', async () => {
      const dir = path.join(tempDir, 'remove-dir');
      await mkdir(path.join(dir, 'sub'), { recursive: true });
      await writeFile(path.join(dir, 'sub', 'file.txt'), 'content', 'utf8');

      await removeItem(dir);

      expect(existsSync(dir)).toBe(false);
    });

    it('should not throw for nonexistent paths', async () => {
      await expect(removeItem(path.join(tempDir, 'nonexistent'))).resolves.not.toThrow();
    });
  });
});
