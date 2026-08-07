import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isTestDirectory } from '../../src/lib/fs-helpers.ts';

// Helper scripts in `packages/agents/content/scripts/` are installed to `~/<harness_home>/scripts/`, a directory not
// on `$PATH`. Agent-facing content must invoke them via the `{harness_home_dir}/scripts/` template,
// which the install pipeline expands per harness. Bare invocations leave the agent guessing a path at runtime.
const KNOWN_SCRIPTS: ReadonlyArray<string> = [
  'describe-change.sh',
  'get-ticket-id.sh',
  'resolve-frontmatter.sh',
  'resolve-merge-options.sh',
  'resolve-reviewer-context.sh',
];

const REQUIRED_PREFIX = '{harness_home_dir}/scripts/';

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SKILLS_DIR = path.join(CONTENT_ROOT, 'skills');
const SUBAGENTS_DIR = path.join(CONTENT_ROOT, 'subagents');

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

// Recognize executable context after `.sh`: a CLI flag, line continuation, quoted arg, shell variable, or shell
// operator. Anything else (a closing backtick, prose word, punctuation) is treated as a non-invocation mention.
const INVOCATION_SUFFIX = /^(?:--|-[A-Za-z]|\\\s*$|"|'|\$[A-Za-z_(@{*]|\||>|<|;|&)/;

describe('helper-script invocation conventions', () => {
  it('every executable invocation of a known helper script uses the {harness_home_dir}/scripts/ prefix', async () => {
    const violations = await findViolations();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  describe('classifier', () => {
    it('flags a bare CLI-flag invocation', () => {
      expect(followsInvocationPattern(' --skill orchestrate --interactive false')).toBe(true);
    });

    it('flags a bare line-continuation invocation', () => {
      expect(followsInvocationPattern(' \\')).toBe(true);
    });

    it('flags a shell-operator invocation', () => {
      expect(followsInvocationPattern(' | grep foo')).toBe(true);
    });

    it('does not flag a closing-backtick prose mention', () => {
      expect(followsInvocationPattern('`')).toBe(false);
    });

    it('does not flag a prose follow-on word', () => {
      expect(followsInvocationPattern(' script renders')).toBe(false);
    });

    it('does not flag punctuation-terminated prose', () => {
      expect(followsInvocationPattern('.')).toBe(false);
    });
  });
});

// region | Helpers

async function collectMarkdownFiles(dir: string, root: string, out: Array<string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || isTestDirectory(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(full, root, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.relative(root, full));
    }
  }
}

async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const files: Array<string> = [];
  await collectMarkdownFiles(SKILLS_DIR, CONTENT_ROOT, files);
  await collectMarkdownFiles(SUBAGENTS_DIR, CONTENT_ROOT, files);
  files.sort();

  for (const relPath of files) {
    const absPath = path.join(CONTENT_ROOT, relPath);
    const content = await readFile(absPath, 'utf8');
    const lines = content.split('\n');
    for (const [index, line] of lines.entries()) {
      for (const script of KNOWN_SCRIPTS) {
        let searchFrom = 0;
        while (searchFrom <= line.length) {
          const idx = line.indexOf(script, searchFrom);
          if (idx === -1) break;
          searchFrom = idx + script.length;
          // Require a non-identifier character before the script name so that
          // partial matches inside longer tokens are ignored.
          const charBefore = idx === 0 ? '' : line.charAt(idx - 1);
          if (charBefore && /[A-Za-z0-9]/.test(charBefore)) continue;
          // Skip occurrences that are already correctly prefixed.
          const prefixStart = idx - REQUIRED_PREFIX.length;
          if (prefixStart >= 0 && line.slice(prefixStart, idx) === REQUIRED_PREFIX) continue;
          const after = line.slice(searchFrom);
          if (!followsInvocationPattern(after)) continue;
          violations.push({ file: relPath, line: index + 1, text: line.trim() });
        }
      }
    }
  }
  return violations;
}

function followsInvocationPattern(after: string): boolean {
  const trimmed = after.replace(/^[ \t]+/, '');
  return INVOCATION_SUFFIX.test(trimmed);
}

function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) return '';
  const header =
    `Found ${violations.length} bare-command invocation(s) of known helper script(s). ` +
    `Each invocation must be prefixed with \`${REQUIRED_PREFIX}\`. ` +
    `See packages/agents/content/scripts/README.md for the convention.`;
  const lines = violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`);
  return [header, ...lines].join('\n');
}

// endregion | Helpers
