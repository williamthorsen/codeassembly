import { defineRdyKit, readFile } from 'readyup';

/**
 * Default internal rdy kit for the codeassembly monorepo.
 *
 * Diagnostic checks for files this repo owns as the source of truth.
 * Generic monorepo and git checks live in upstream kits — see
 * williamthorsen/templates.node-monorepo and williamthorsen/git-recon.
 */
export default defineRdyKit({
  checklists: [
    {
      name: 'default',
      checks: [
        {
          name: '.agents/PROJECT.md is non-empty',
          check: () => {
            const content = readFile('.agents/PROJECT.md');
            return content !== undefined && content.trim().length > 0;
          },
          fix: 'Populate .agents/PROJECT.md with project context for AI agents',
        },
        {
          name: '.claude/CLAUDE.md references @.agents/PROJECT.md',
          check: () => {
            const content = readFile('.claude/CLAUDE.md');
            return content !== undefined && content.includes('@.agents/PROJECT.md');
          },
          fix: 'Add `@.agents/PROJECT.md` to .claude/CLAUDE.md so Claude reads project context',
        },
        {
          name: '.meta/label-map.json exists',
          check: () => {
            const content = readFile('.meta/label-map.json');
            return content !== undefined;
          },
          fix: 'Run `codeassembly-agents generate label-map` to create a starter label map',
        },
      ],
    },
  ],
});
