/** @noformat — @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.21.2";


// .readyup/kits/default.ts
import { defineRdyKit } from "readyup";
import { readFile } from "readyup/check-utils";
var default_default = defineRdyKit({
  checklists: [
    {
      name: "default",
      checks: [
        {
          name: ".agents/PROJECT.md is non-empty",
          check: () => {
            const content = readFile(".agents/PROJECT.md");
            return content !== void 0 && content.trim().length > 0;
          },
          fix: "Populate .agents/PROJECT.md with project context for AI agents"
        },
        {
          name: ".claude/CLAUDE.md references @.agents/PROJECT.md",
          check: () => {
            const content = readFile(".claude/CLAUDE.md");
            return content !== void 0 && content.includes("@.agents/PROJECT.md");
          },
          fix: "Add `@.agents/PROJECT.md` to .claude/CLAUDE.md so Claude reads project context"
        },
        {
          name: ".meta/label-map.json exists",
          check: () => {
            const content = readFile(".meta/label-map.json");
            return content !== void 0;
          },
          fix: "Run `codeassembly-agents generate label-map` to create a starter label map"
        }
      ]
    }
  ]
});
export {
  default_default as default
};
