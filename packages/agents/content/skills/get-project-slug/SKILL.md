---
name: get-project-slug
description: Derive project slug for artifact path namespacing
user-invocable: false
---

# Get project slug

Return the project slug used to namespace orchestration artifacts. The slug is derived once and persisted to `.agents/preferences.yaml` for subsequent invocations.

## Resolution order

### 1. Config lookup (preferred)

Check `.agents/preferences.yaml` for `project.slug`:

```yaml
project:
  slug: configs-macos
```

If found, return immediately.

If `project.slug` is not found, fall back to `repository.slug` (deprecated). If the fallback is used, emit a brief note: "Reading slug from deprecated repository.slug — update preferences.yaml to use project.slug."

### 2. Git remote derivation

Extract from the `origin` remote URL:

```bash
git remote get-url origin 2>/dev/null
```

Parse the URL (HTTPS or SSH) to extract `{owner}` and `{repo}`:

- `https://github.com/williamthorsen/configs.macos.git` → `williamthorsen-configs-macos`
- `git@github.com:williamthorsen/configs.macos.git` → `williamthorsen-configs-macos`

Format: `{owner}-{repo}` in kebab-case (replace dots and underscores with hyphens, lowercase).

### 3. Directory basename (last resort)

If no git remote exists:

```bash
basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

Convert to kebab-case.

## Persist result

After deriving from step 2 or 3, **immediately write** the result to `.agents/preferences.yaml` under `project.slug`.

- If `.agents/preferences.yaml` exists, add `project.slug` to it (preserving existing content)
- If `.agents/preferences.yaml` doesn't exist, create it with just `project.slug`

This ensures subsequent invocations hit step 1 (instant config lookup).

## Constraints

- Always return a single string (the slug)
- Slug must be kebab-case, lowercase, filesystem-safe
- Do not prompt the user — this is a non-interactive utility skill
