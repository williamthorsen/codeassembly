import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import { isEnoent } from '../../lib/type-guards.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';

// Installs the real content library, not a fixture, to catch failures that only show up with real
// content, such as an unreplaced `{...}` token or a link that wasn't rewritten.
describe('install (real library, full catalog)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

    // Each installed harness's skill count matches the source enumeration of non-skill support entries (no `SKILL.md`).
    // Harness skills and the general catalog now deploy per-project via `sync`, so only support entries
    // (directories without a `SKILL.md`) count toward the install delivery.
    const contentDir = resolveContentDir();
    const supportEntries = await listInstalledSupportEntries(path.join(contentDir, 'skills'));
    for (const home of ['.claude', '.rovodev']) {
      const installedSkills = await readdir(path.join(tempDir, home, 'skills'));
      expect(installedSkills.length).toBe(supportEntries.length);
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

  it('does not install any subagent into any harness', async () => {
    await installCommand(makeOptions(), tempDir);

    for (const subagentsDir of [path.join(tempDir, '.claude', 'agents'), path.join(tempDir, '.rovodev', 'subagents')]) {
      const mdFiles = existsSync(subagentsDir)
        ? (await readdir(subagentsDir)).filter((entry) => entry.endsWith('.md'))
        : [];
      expect(mdFiles).toHaveLength(0);
    }
  });
});

const INSTALLED_TIERS: ReadonlyArray<string> = ['.claude', '.rovodev', '.agents'];

/**
 * Returns the visible entries under `content/skills/` that install delivers as support directories: those without a
 * readable `SKILL.md` (e.g. `_data`). Skill directories — those holding a `SKILL.md` — are excluded, since `sync`
 * delivers them per-project. Mirrors install's own skill-vs-support gate.
 */
async function listInstalledSupportEntries(skillsSrcDir: string): Promise<Array<string>> {
  const entries = (await readdir(skillsSrcDir)).filter(
    (entry) => entry !== '_harnesses' && entry !== '_partials' && !entry.startsWith('.'),
  );
  const supportEntries: Array<string> = [];
  for (const entry of entries) {
    try {
      await stat(path.join(skillsSrcDir, entry, 'SKILL.md'));
    } catch (error: unknown) {
      if (isEnoent(error)) {
        supportEntries.push(entry);
        continue;
      }
      throw error;
    }
  }
  return supportEntries;
}

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
