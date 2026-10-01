# Content API

The `codeassembly/api` subpath serves a content root's own tests. A producer that ships rulebooks, skills, or subagents can test its content as consumers will receive it, without importing anything from the tool's internals.

```ts
import { HARNESS_IDS, renderContentRoot } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

describe.each(HARNESS_IDS)('content rendered for %s', (harness) => {
  it('does not leave any template token unreplaced', async () => {
    const tree = await renderContentRoot(CONTENT_ROOT, { harness });

    const offenders = Object.entries(tree)
      .filter(([, { body }]) => body.includes('{harness_home_dir}'))
      .map(([deployedPath]) => deployedPath);
    expect(offenders).toEqual([]);
  });
});
```

Every function takes the content root as a filesystem path. A workspace consumer resolves the subpath to TypeScript source through the `source` export condition; any other consumer resolves it to the built output.

## Functions

The doc comments in `src/api.ts` are the reference. In summary:

- **`renderContentRoot(root, { harness, guidanceHooks? })`** returns everything that the root ships for one harness, as a consumer declaring all of it receives it. That includes skills with their support files, rulebook-delivered skills, subagents, `skills/` support entries, and the harness guidance file with the root's ambient rulebooks in its ambient region. Deployment markers are included. The result is keyed by path relative to the harness home (`skills/<slug>/SKILL.md`, `agents/<slug>.md`, `CLAUDE.md`). Each entry contains the file's whole text as `body`, and a Markdown file with frontmatter also contains the parsed `frontmatter`. `guidanceHooks` maps each hook to the rulebook slugs bound to it; without it, every hook is stripped. Dependency edges into the built-in library resolve, but only the root's own artifacts are rendered. The function throws one error naming every file that failed.
- **`listCatalog(root)`** returns the root's artifact slugs per type: `rulebook`, `skill`, `subagent`, and `collection`.
- **`resolveClosure(root, seeds)`** returns the dependency closure of `seeds` within the root, in the same shape. It follows `dependencies:`, a collection's `members:`, a subagent's `skills:`, and the invocation tokens in each body. Collections are traversal-only, so the result's `collection` list is empty. It throws on an edge that resolves nowhere in the root, or on a cycle.
- **`readArtifact(root, type, slug)`** returns one artifact's parsed `frontmatter` and its source `body` with includes expanded, before any per-harness rewrite.
- **`validateContentRoot(root, harnesses)`** returns the defects that `codeassembly validate` reports for the root, or an empty list.
- **`HARNESS_IDS`** lists every supported harness, so a suite looping over it covers a new harness without an edit.

## Scope

The API exports coarse functions over a content root, never the tool's internals. A test that cannot be written against these functions is evidence of a missing function. The missing function belongs here only when it answers a question that a content root's tests would ask in general.
