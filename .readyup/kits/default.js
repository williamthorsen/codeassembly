/** @noformat — @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */

// node_modules/.pnpm/readyup@0.16.0_esbuild@0.28.0/node_modules/readyup/dist/esm/authoring.js
function defineRdyKit(kit) {
  return kit;
}

// node_modules/.pnpm/readyup@0.16.0_esbuild@0.28.0/node_modules/readyup/dist/esm/check-utils/filesystem.js
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function readFile(relativePath) {
  const fullPath = join(process.cwd(), relativePath);
  if (!existsSync(fullPath)) return void 0;
  return readFileSync(fullPath, 'utf8');
}

// node_modules/.pnpm/readyup@0.16.0_esbuild@0.28.0/node_modules/readyup/dist/esm/check-utils/hashing.js
import { createHash } from 'node:crypto';

// .readyup/kits/default.internal.ts
var default_internal_default = defineRdyKit({
  checklists: [
    {
      name: 'default',
      checks: [
        {
          name: '.agents/PROJECT.md is non-empty',
          check: () => {
            const content = readFile('.agents/PROJECT.md');
            return content !== void 0 && content.trim().length > 0;
          },
          fix: 'Populate .agents/PROJECT.md with project context for AI agents',
        },
        {
          name: '.claude/CLAUDE.md references @.agents/PROJECT.md',
          check: () => {
            const content = readFile('.claude/CLAUDE.md');
            return content !== void 0 && content.includes('@.agents/PROJECT.md');
          },
          fix: 'Add `@.agents/PROJECT.md` to .claude/CLAUDE.md so Claude reads project context',
        },
      ],
    },
  ],
});
export { default_internal_default as default };
