import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../lib/directive-expander.ts';

// A relative Markdown link in installable content is rewritten at install time by `rewriteMarkdownPaths`, which
// resolves it against the *host* file's directory — the skill or subagent the link renders into, not the partial it
// may have been authored in. A link whose target has moved or been deleted still installs cleanly, leaving the agent
// to follow a link to nothing. Resolving every link the way the installer does turns that into a build failure.
//
// Host roots only. A `_partials/` file is never installed standalone, and its links are authored against the host that
// inlines it — checking one in isolation would misresolve every `../` it carries. Include expansion below reaches them
// through each host, which is the only context where they mean anything. `guidance/` is copied verbatim with no link
// rewriting, so it is out of scope.
const HOST_ROOTS: ReadonlyArray<string> = ['skills', 'subagents'];

const CONTENT_ROOT = new URL('../../content/', import.meta.url).pathname;

const MARKDOWN_LINK_REGEX = /\[[^\]]*\]\(([^)]+)\)/g;

interface Violation {
  readonly file: string;
  readonly target: string;
}

/** Recursively collects installable host `.md` files, skipping `_partials/` at any depth and dotfiles. */
async function collectHostFiles(dir: string, out: Array<string>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '_partials' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectHostFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const hostFiles: Array<string> = [];
  for (const root of HOST_ROOTS) {
    await collectHostFiles(path.join(CONTENT_ROOT, root), hostFiles);
  }
  hostFiles.sort();

  const violations: Array<Violation> = [];
  for (const hostFile of hostFiles) {
    const expanded = await expandIncludes(hostFile, CONTENT_ROOT);
    for (const match of expanded.matchAll(MARKDOWN_LINK_REGEX)) {
      const target = match[1];
      if (target === undefined || !isRelativeTarget(target)) {
        continue;
      }
      const targetPath = target.split('#')[0];
      if (targetPath === undefined || targetPath === '') {
        continue;
      }
      if (!existsSync(path.resolve(path.dirname(hostFile), targetPath))) {
        violations.push({ file: path.relative(CONTENT_ROOT, hostFile), target });
      }
    }
  }
  return violations;
}

function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) {
    return '';
  }
  const header =
    `Found ${violations.length} relative Markdown link(s) whose target does not exist. Each is resolved against the ` +
    `host file's directory, matching how \`rewriteMarkdownPaths\` resolves it at install time. A link authored in a ` +
    `partial is reported against every host that inlines it, so fix the partial rather than the host.`;
  const lines = violations.map((v) => `  ${v.file}: ${v.target}`);
  return [header, ...lines].join('\n');
}

/** Reports whether a link target is a relative path — the only form the install pipeline rewrites. */
function isRelativeTarget(target: string): boolean {
  return !(
    /^https?:\/\//.test(target) ||
    target.startsWith('/') ||
    target.startsWith('~') ||
    target.startsWith('#') ||
    target.startsWith('{')
  );
}

describe('installable-content link resolution', () => {
  it('every relative Markdown link in an installable host resolves to a real file', async () => {
    const violations = await findViolations();
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
