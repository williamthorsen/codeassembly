---
name: development-workflows
description: Development workflow conventions including pnpm commands, quality gates, and type-checking
user-invocable: false
---

# Development workflows

Rules for development processes, tool usage, and quality gates.

## Command execution

### Package management commands

**Never use ambiguous `pnpm {binary}` or `pnpm {script}` shorthand syntax.** It's unclear what runs: a subcommand, a binary, or a script?

- **Always use `pnpm run {script}`** for package.json scripts
- **Always use `pnpm exec {binary}`** for binary executables
- This applies to all contexts: commands, documentation, examples, CLAUDE.md files

Examples:

```bash
# ✅ Correct - running a script
pnpm run build
pnpm run test

# ✅ Correct - executing a binary
pnpm exec prettier --write src/
pnpm exec eslint src/

# ❌ Incorrect - ambiguous
pnpm build
pnpm prettier --write src/
```

## Quality gates

### Code quality requirements

- **Always run linting and type-checking before considering code complete** - Mandatory
- Auto-format code before staging or considering it complete
- All quality checks must pass before work is finished

### Type-checking

**Do not use `tsc`** - it's very slow. Always use exactly:

```shell
tsgo --noEmit
```

## Performance optimization

### Config-first principle

**Prefer explicit configuration over dynamic discovery:**

- **Fast path**: Read from `.agents/preferences.yaml` or project config
- **Fallback only**: Use system commands when config is missing
- **Never both**: If config exists, ignore dynamic discovery

**Benefits:**

- Token efficiency: Single file read vs multiple tool calls
- Time savings: ~100ms file read vs ~500-1000ms command
- Reliability: No command parsing failures

### Function call optimization

**Avoid repeated function calls within same task:**

- Execute functions once at task start
- Store and reuse results
- Document explicitly: "identify once and remember for this task"
