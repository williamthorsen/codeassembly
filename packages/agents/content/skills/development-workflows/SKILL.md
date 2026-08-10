---
name: development-workflows
description: Development workflow conventions covering quality gates and agent efficiency
user-invocable: false
---

# Development workflows

Rules for development processes and quality gates.

## Quality gates

### Code quality requirements

- **Always run linting and type-checking before considering code complete** - Mandatory
- Auto-format code before staging or considering it complete
- All quality checks must pass before work is finished

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
