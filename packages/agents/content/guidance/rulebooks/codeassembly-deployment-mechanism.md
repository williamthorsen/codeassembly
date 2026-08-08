---
slug: codeassembly-deployment-mechanism
description: How CodeAssembly deploys its content, how a deployed file is recognized, and why one is never edited in place.
delivery: ambient
version: 1
---

# CodeAssembly deployment mechanism

`codeassembly install` and `codeassembly sync` deploy CodeAssembly content into the harnesses that read it. Each leaves a provenance marker: `install` writes a `GENERATED FILE` comment line, and `sync` writes a `<!-- codeassembly-skill:… -->` ownership marker, or its `-subagent:` or `-rulebook:` sibling, after the frontmatter. `sync` marks an artifact's root file alone, so a skill's nested Markdown and its bundled scripts carry no marker of their own and are deployed all the same.

Editing a deployed file in place loses the change the next time its deploying command runs. Before editing a file that carries a marker, or that sits inside a skill directory whose `SKILL.md` carries one, follow [deployed-file provenance](../../skills/_data/deployed-file-provenance.md) to find its source and its redeploy path.
