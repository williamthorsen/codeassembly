import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';

// The only tests that install the real library; they assert real-content invariants a synthetic fixture cannot.
// Adding more real installs here raises the suite's parallel-load cost, so keep them to the minimum below.
describe('install smoke (real library)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, '.claude', 'agents'), { recursive: true });
    await mkdir(path.join(tempDir, '.rovodev', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, '.rovodev', 'subagents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'all', link: false, force: false, dryRun: false, ...overrides };
  }

  it('installs the full library cleanly with the expected skill count and no unresolved tokens or links', async () => {
    // A throw here means the real catalog failed to expand/rewrite/write end-to-end.
    await installCommand(makeOptions(), tempDir);

    // Each installed harness's skill count matches the source enumeration (shared skills + that harness's skills).
    const contentDir = resolveContentDir();
    const sharedSkills = (await readdir(path.join(contentDir, 'skills'))).filter(
      (e) => e !== '_harnesses' && e !== '_partials' && !e.startsWith('.'),
    );
    for (const [harness, home] of [
      ['claude', '.claude'],
      ['rovodev', '.rovodev'],
    ] as const) {
      const harnessSkillsDir = path.join(contentDir, 'skills', '_harnesses', harness);
      const harnessSkills = existsSync(harnessSkillsDir)
        ? (await readdir(harnessSkillsDir)).filter((e) => !e.startsWith('.'))
        : [];
      const installedSkills = await readdir(path.join(tempDir, home, 'skills'));
      expect(installedSkills.length).toBe(sharedSkills.length + harnessSkills.length);
    }

    // No installed file retains a raw template token.
    const tokenOffenders = await collectMarkdownMatches(tempDir, (content) => content.includes('{harness_home_dir}'));
    expect(tokenOffenders).toEqual([]);

    // No installed Markdown link points at a bare-relative target (all are rewritten to absolute/tilde paths).
    const linkViolations = await collectBareRelativeLinks(tempDir);
    expect(linkViolations, formatViolations(linkViolations)).toEqual([]);
  });

  it('does not bypass path rewriting in link mode', async () => {
    await installCommand(makeOptions({ link: true }), tempDir);

    const linkViolations = await collectBareRelativeLinks(tempDir);
    expect(linkViolations, formatViolations(linkViolations)).toEqual([]);
  });
});

const INSTALLED_TIERS: ReadonlyArray<string> = ['.claude', '.rovodev', '.agents'];

/** Collects the relative paths of installed Markdown files whose content satisfies `predicate`. */
async function collectMarkdownMatches(
  baseDir: string,
  predicate: (content: string) => boolean,
): Promise<Array<string>> {
  const offenders: Array<string> = [];
  for (const tier of INSTALLED_TIERS) {
    const tierDir = path.join(baseDir, tier);
    if (!existsSync(tierDir)) {
      continue;
    }
    await walkMarkdownFiles(tierDir, async (filePath) => {
      if (predicate(await readFile(filePath, 'utf8'))) {
        offenders.push(path.relative(baseDir, filePath));
      }
    });
  }
  return offenders;
}

/** Collects installed Markdown links whose target is bare-relative (not http(s), absolute, tilde, or anchor). */
async function collectBareRelativeLinks(baseDir: string): Promise<Array<{ file: string; target: string }>> {
  const violations: Array<{ file: string; target: string }> = [];
  for (const tier of INSTALLED_TIERS) {
    const tierDir = path.join(baseDir, tier);
    if (!existsSync(tierDir)) {
      continue;
    }
    await walkMarkdownFiles(tierDir, async (filePath) => {
      const content = await readFile(filePath, 'utf8');
      for (const match of content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
        const target = match[2];
        if (target === undefined || /^(https?:\/\/|\/|~\/|#)/.test(target)) {
          continue;
        }
        violations.push({ file: path.relative(baseDir, filePath), target });
      }
    });
  }
  return violations;
}

/** Walks `dir`, invoking `visit` for each non-symlinked `.md` file. Symlinks are skipped because readFile follows them. */
async function walkMarkdownFiles(dir: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const info = await lstat(full);
    if (info.isSymbolicLink()) {
      continue;
    }
    if (info.isDirectory()) {
      await walkMarkdownFiles(full, visit);
    } else if (entry.endsWith('.md')) {
      await visit(full);
    }
  }
}

function formatViolations(violations: ReadonlyArray<{ file: string; target: string }>): string {
  if (violations.length === 0) {
    return '';
  }
  const lines = violations.map((v) => `  ${v.file}: [...](${v.target})`);
  return `Installed Markdown contains bare-relative link targets:\n${lines.join('\n')}`;
}
