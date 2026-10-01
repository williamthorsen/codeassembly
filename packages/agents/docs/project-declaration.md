# Project declaration

The reference for `.agents/codeassembly.yaml`: its format, the sources and packages from which artifacts come, and the scopes in which the declaration resolves. The [README](../README.md#project-declaration) introduces it.

## Format

The declaration is grouped by artifact type. Each type's block takes a `use` list (the slugs to adopt) and an optional `drop` list (slugs to remove from what broader scopes contributed):

```yaml
rulebooks:
  use:
    - shell-conventions
skills:
  use:
    - people-report
subagents:
  use:
    - canary
```

A declared rulebook is delivered by its delivery mode: An `ambient` rulebook is injected into the ambient region of each targeted harness's guidance file, and a `skill` rulebook is delivered as a `consult-<slug>` skill in each targeted harness. A third mode, `hook`, doesn't produce any delivery of its own: It records that the rulebook is reached by a guidance-hook binding, which a `codeassembly.yaml` writes rather than the rulebook (see [Guidance hooks](#guidance-hooks)). A rulebook may declare any combination of the three, and a list naming none of them is rejected.

A declared skill is deployed into each targeted harness's project-local skills directory (`.claude/skills/<slug>/`) with the harness transform applied (include expansion, `{tool:…}` rewrite, link rewriting), carrying a `<!-- codeassembly-skill:<slug> -->` ownership marker so that `sync` can retract it once it is no longer declared. Bare `sync` deploys into the project's harness directories; `sync --global` resolves the user-global tier and deploys the same way into the home harness directories instead (see [Scopes](#scopes)).

A skill may restrict itself to specific harnesses with a `supported-harnesses:` frontmatter field (a single harness id or a list, e.g. `supported-harnesses: [rovo]`); `sync` then deploys it only into those harnesses, and `library list` shows the restriction. A skill without a `supported-harnesses:` field deploys to every harness. This is how a skill that one harness provides natively, but a source supplies for the others, is targeted at just the harnesses that need it, without duplicating it per harness.

A declared subagent is deployed into each targeted harness's project-local subagents directory (`.claude/agents/<slug>.md`), with the harness transform applied (frontmatter `_defaults` merge, `{tool:…}` rewrite, `{harness_home_dir}` rewrite) and a `<!-- codeassembly-subagent:<slug> -->` ownership marker so that `sync` can retract it once it is no longer declared. A declared subagent deploys into the repo under `sync` and into the home harness directories under `sync --global`.

`rulebooks`, `skills`, `subagents`, and `collections` are all deployed.

Two further top-level keys name where artifacts come from rather than which to adopt: `sources` (see [Sources](#sources)) and `packages` (see [Packages](#packages)). `packages` takes the same `use`/`drop` shape as a type block, so the semantics above carry over to it unchanged.

A third, `harnesses`, names where they go: see [Harness targeting](#harness-targeting). A fourth, `guidance-hooks`, configures the artifacts the rest adopt rather than naming any: see [Guidance hooks](#guidance-hooks).

A fifth, `references`, names a dependency's bundled documentation to point at rather than artifacts to deploy; see [References](#references).

### Harness targeting

`harnesses` declares which harnesses a run deploys into, in the same `use`/`drop` shape as a type block, with harness ids for entries:

```yaml
harnesses:
  use:
    - claude
  drop:
    - rovo
```

A run resolves its targets in this order, stopping at the first that answers:

1. The `--harness <id>` flag. (`--harness all` is the not-specified default and falls through.)
2. The `harnesses` declaration, if any file in the chain declares one. A declaration that resolves to an empty set is honored: The run targets nothing and says so.
3. The harnesses installed for this user, detected by the presence of their home directories (`~/.claude`, `~/.rovo`). A harness home is created by that harness's own installer, so its presence is evidence the harness is installed; a repository's own `.claude/` directory is not, which is why the repository is never probed.

**`harnesses` resolves on a chain of its own.** Which harnesses a developer runs is a fact about the developer. The key resolves across the user-global and project tiers together, the one key that crosses the domains defined under [Scopes](#scopes). Artifact keys deliberately do not: A user-global `collections: use: [all]` would otherwise deploy the whole catalog into every repository's harness directories.

**`root: true` clears only its own domain's contributions.** For every artifact key this is indistinguishable from clearing the whole chain, since their chain lies within one domain. It matters for `harnesses` alone, because it keeps a committed project file from discarding what the developer declared in the user-global tier. A `drop` still crosses the boundary, from either project-tier file: the committed `.agents/codeassembly.yaml` withdraws a harness for everyone working on the project, and the gitignored `.agents/codeassembly.local.yaml` withdraws one for a single checkout.

The three tiers therefore state three different things: the user-global tier states which harnesses are installed, the project tier states which the project requires, and `codeassembly.local.yaml` overrides either for one developer.

**Targeting selects the harness set; artifact narrowing filters within it.** A run targeting `[claude, rovo]` with a skill declaring `supported-harnesses: [rovo]` deploys that skill to Rovo alone. The two keys are distinct: `harnesses` lives in `codeassembly.yaml` and governs a whole run, while `supported-harnesses` lives in an artifact's frontmatter and governs that artifact.

`sync`, `sync --global`, and `install` all honor the declaration; `install` resolves it against the home tier alone, since it deploys into the harness homes. A declaration naming a harness whose home does not yet exist provisions that home, which detection could never reach. `uninstall`, `status`, and `configure-hooks` read `--harness` and the installed set, never the declaration: They must reach what is installed rather than what is declared.

**Dropping a harness from the declaration retracts it.** The next `install` removes that harness's tracked files, unwires its session-lifecycle hook entries, and drops it from the manifest; an empty declared set retracts every harness. A user-modified file is kept without `--force` and keeps its harness tracked for that file alone, and `--dry-run` previews the removals. The next `sync` clears what it deployed there in turn: skills across both namespaces, subagents, the per-source support root, the ambient region, and the `prompts.yml` region. Every removal there is gated on a sync provenance marker or a well-formed sync-owned region, so a hand-authored file survives. A damaged region is reported and left standing, since repairing the markers is the developer's call. The harness-home guidance file keeps its ambient markers, whose placement is `install`'s; the project-local host loses the region outright and is deleted once nothing else remains in it. Retraction follows the declaration alone in both commands: `--harness claude` names a run's target rather than declaring the other harnesses unwanted, and a harness that detection misses doesn't have a home directory holding stale files.

Every run names what it targeted and what decided it:

```
Targeting claude, rovo (detected in ~).
```

### Guidance hooks

A **guidance hook** is a named slot that a skill or subagent declares in its body with `<!-- guidance-hook: <name> -->`, filled at sync time with the bodies of the rulebooks bound to it by a declaration. It is the third route that guidance takes into an agent's context, beside `delivery: ambient`, which charges every session, and `delivery: skill`, which depends on the agent choosing to consult it. A hook is scoped to the act: The guidance is present when the skill runs, and nowhere else.

A rulebook records the route with `delivery: hook`, alone or alongside the other two. That mode instructs nothing, unlike its siblings: The binding lives in a `codeassembly.yaml`, so a rulebook cannot splice itself into a host body and a hook fills from the deploy closure whether or not the rulebook names the route. Declaring it enables the three checks below.

`guidance-hooks` is the one map-valued key. Each hook name owns a `use`/`drop` block of its own, resolved on the scope chain exactly as an artifact type is. A tier binds to one hook without disturbing another:

```yaml
guidance-hooks:
  implementation-preferences:
    use:
      - williamthorsen-code-layout-preferences
      - williamthorsen-typescript-preferences
```

A binding is also a dependency edge: A bound rulebook joins the deploy closure and still deploys by its own `delivery:`, so binding it and declaring it are one act. Bound bodies fill in declaration order, with their headings demoted one level so that a rulebook's title nests under the host's structure, and the result is wrapped in `<!-- codeassembly-guidance-hook:<name>:start -->` / `:end` markers enclosing one `<!-- rulebook:<slug> -->` block per rulebook, each naming the rulebook's version on a `<!-- rulebook-version: <version> -->` line when it declares one. A deployed file therefore says what filled it, and at which version, without being re-rendered.

A hook that nothing binds contributes nothing to deployed output, marker included. `install` doesn't read any `guidance-hooks:` block, so every hook in a harness guidance template is unbound; so is every hook in a rulebook body, a `skills/_data/` support entry, or a harness guidance file, none of which a binding can reach. Filling is for declared skills and subagents alone.

Name a hook for the concern rather than the consumer (`implementation-preferences`, not `implement-plan-preferences`), since concern-scoping lets one binding fill every consumer, and don't give it a user or org prefix, since the slot is generic and only the binding is personal. Names are lowercase kebab-case and letter-led, the same grammar enforced by the directive. Concern-scoping and the no-prefix rule are conventions; nothing checks them.

The library declares four hook names:

| Hook                         | Concern                                                        | Declared by                                                                           |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `comment-preferences`        | the register and line wrapping of comments written into source | the coder subagent, the five reviewer subagents, `prose-reviser`, and `revise-prose`  |
| `implementation-preferences` | how code is written and judged                                 | the implementing and reviewing skills, the coder, and the five plan-shaping subagents |
| `ticketing-preferences`      | how work is split across tickets                               | the ticket-composing skills and `planner`                                             |
| `writing-preferences`        | how agent-authored prose reads                                 | every subagent but the deployment canary and `handoff-reviewer`, and `revise-prose`   |

A binding fills a hook with the whole of the bound rulebook's body, and a declaration cannot bind part of one. A rulebook bound to a hook that only subagents declare is spliced entire into every declaring subagent, and none of the reports below can see that it contains guidance that those subagents don't use. Keep such a rulebook coherent for its narrowest consumer: Once it mixes session-only guidance with the subagent-relevant kind, split it rather than binding the whole.

Two failures are worth naming. A binding to a rulebook that does not exist fails the run, naming the rulebook and the hook that bound it. A binding to a rulebook whose own body declares a hook fails too: Bound guidance is spliced as rendered, so nothing downstream could fill a hook inside it.

Three further mismatches are reported without failing the run, on a live sync and a dry run alike. A rulebook's `delivery` is written by its author and a binding by whoever adopts it. A disagreement between the two is not always the adopter's to resolve:

| Reported          | Condition                                                                                     | Level   |
| ----------------- | --------------------------------------------------------------------------------------------- | ------- |
| Bound, undeclared | a binding names a rulebook whose `delivery` omits `hook`                                      | warning |
| Bound, unreached  | a binding names a hook not declared by any deployed skill or subagent, so it delivers nothing | advice  |
| Declared, unbound | a rulebook names `hook` and isn't used by any binding                                         | advice  |

The last two are not defects. A collection can carry a hook-declaring rulebook into a project that never binds it, and a home-tier binding applies to every project, including those that deploy nothing declaring the hook. Each line names an affordance going unused rather than something broken. A binding that reaches nothing is also how a mistyped hook name surfaces, since nothing else would say so.

A rulebook whose `delivery` names `ambient` alongside `hook` is reported by none of them, and two things make the pairing legitimate. A hook that only subagents declare duplicates nothing: A subagent's context never contains the ambient region. The two routes are how one rulebook reaches a session and a subagent both. When a skill declares the hook, ambient delivery places the rulebook in the guidance file loaded by that session, so the fill hands it a second copy; the author who wrote both routes into `delivery` has weighed that, and the skill may be parsing what the fill delivers rather than only containing it, as `revise-prose` does. `content/__tests__/guidance-hook-reach.unit.test.ts` holds the library's record of which skills may.

A guidance hook is not a partial. A partial resolves by path, fixed at authoring time; a guidance hook resolves by binding, chosen per project or per machine. Guidance that every consumer of the library should get is a partial; guidance that one user or one project wants is a hook. See `content/_partials/README.md`.

## Collections

A collection is a traversal-only aggregate: It doesn't deploy any file of its own, but declaring it pulls in its members' transitive closure, which `sync` then deploys. Declare one like any other type:

```yaml
collections:
  use:
    - recommended
```

A collection lists its constituents under a `members:` key, either an explicit per-type block (the same shape that `dependencies:` uses) or the computed token `'@library'`:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents declare prerequisite edges under `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error that names the offending artifact.

Dropping or omitting a collection, or setting `root: true`, excludes its entire closure; dropping a single member that a collection contributed is not supported, so opt out of the whole collection or declare members à la carte instead.

Five collections ship, each making a claim that a reader can act on:

| Collection       | Claim                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `atlassian`      | Examined and found fitted to Bitbucket and Jira. Nothing outside it reaches its members, so only declaring it deploys them.        |
| `recommended`    | Examined and found generally applicable: no personal doctrine, no coupling to one author's environment.                            |
| `williamthorsen` | Examined and found deliberately personal: one author's preferences, environment, and domain.                                       |
| `triage`         | Not yet examined, and where new content starts. It shrinks by promotion.                                                           |
| `all`            | The whole catalog, computed. It doesn't make any claim about its members, and is the escape hatch rather than the expected choice. |

An artifact in none of them is standalone: deliberate, declared directly where wanted, and either too rarely invoked to justify a standing line in the skill index or wanted only in specific projects. The criteria deciding which disposition an artifact takes are recorded in the `codeassembly-content-specification` rulebook, under `## Collections`.

`codeassembly init --global` seeds the user-global declaration (`~/.agents/codeassembly.yaml`) with `recommended` and `triage`; add any other collection to that file by hand. A project adds a collection for repo deployment by declaring it explicitly.

### The `@library` token

A collection whose `members:` is the string `'@library'` resolves to every deployable artifact (all rulebooks, skills, and subagents) in the content root from which the collection resolves: the declared source from which the collection resolved, and no other. It is computed at resolution time so that a newly added artifact joins automatically without an edit to the collection. The `@` sigil marks a computed directive rather than a literal slug, so the value must be YAML-quoted (`'@library'`). Collections are excluded from the result: The resolver never emits them, and "every collection" would be self-referential.

The shipped `all` collection declares `'@library'`; declaring `collections: use: [all]` deploys the whole catalog.

## Dependencies

A rulebook, skill, or subagent may declare dependencies on other artifacts in its frontmatter, grouped by artifact type. Resolution follows these edges transitively (deduped, with cycle detection), so declaring one artifact pulls in its whole closure:

```yaml
dependencies:
  rulebooks:
    - shell-conventions
  skills:
    - people-report
  subagents:
    - canary
```

The resolver follows `members:` and `dependencies:` identically; the split is semantic: A collection _contains_ members, while an artifact _depends on_ prerequisites.

## Sources

A declared artifact resolves from the content directories that the declaration names, and from nowhere else. A top-level `sources:` list names them (a clone of the CodeAssembly library, a machine-local directory, a project-local one, or a third-party guidance repo), each structured like `packages/agents/content/` (`guidance/rulebooks/`, `guidance/_harnesses/`, `guidance/shared/`, `skills/`, `subagents/`, `collections/`, `scripts/`); a package adopted via [`packages`](#packages) is a source too. `sync`, `sync --global`, and `install` stop before writing anything, `--dry-run` included, when the governing chain declares no source, or when none of the declared sources has a directory, and the message names the file that the declaration belongs in. A project resolves from its own chain alone, never from the sources that the home chain declares, so a project deploys the same content on every machine.

```yaml
sources:
  - name: codeassembly
    path: ~/repos/codeassembly/packages/agents/content
  - name: org-guidance
    path: ../shared-guidance
  - name: personal
    path: ~/guidance
rulebooks:
  use:
    - team-standards
```

Each source is a `{ name, path }` pair (both required). A relative `path` resolves against the declaring file's `.agents/` directory; `~` expands to the home directory, and absolute paths are used as-is. A source may declare the content format against which it was authored; see [Content-format version](#content-format-version). Declaration entries stay bare slugs: Resolution is transparent, so `team-standards` resolves from whichever source provides it, without a per-entry `from:` syntax.

**Precedence.** A later-declared source shadows an earlier one, which lets a source override a same-slug artifact of another. `sync` warns about every artifact that a higher-precedence source shadows in a lower one, and `sync --dry-run` and `library list` name the source of each. Declare the CodeAssembly library first, so that every source declared after it can override it. A package adopted via [`packages`](#packages) is a source too, ranked below every hand-declared one. Repeating a source `name` remaps its path and moves it ahead of the sources declared before it. Because paths are `.agents/`-relative, commit only repo-relative source paths in `codeassembly.yaml`; confine machine-specific and absolute paths to `codeassembly.local.yaml`. A higher-precedence tier's `root: true` discards previously-declared sources exactly as it discards `rulebooks`, `skills`, `subagents`, and `collections`.

**Undeclared content.** `scripts/` and the harness guidance templates under `guidance/_harnesses/` are not named by any declaration entry, so they resolve by directory rather than by slug and `install` deploys them. Scripts merge by file name across every root: A source shipping one script leaves another root's other scripts in place. A harness's template directory is owned whole by the highest-precedence root shipping it, which keeps the `guidance/shared/AGENTS.md` that a template inlines resolving inside one root; a template file omitted by the owning source is retracted from the harness home. A file name or template directory shipped by more than one root installs from the highest-precedence one and warns. A deployed guidance file's provenance marker names its path within the source, the source's name, and the source directory.

Every artifact type resolves through sources: An artifact's body and its closure edges (`dependencies:`, or `members:` for a collection) resolve from the source that owns it, with the same ownership and retraction semantics in every source. A source-resolved skill or subagent expands its `<!-- include: … -->` directives against its own source root: It can reuse partials within its own source tree, but a target that resolves outside that root fails. A source-resolved **collection** expands its members through the resolver like any other type, and its `'@library'` token is source-scoped: It enumerates that source's own catalog rather than every declared source's. A declared source whose path is not a directory, or is unreadable, fails the run (dry-run included) before any file is written; one whose directory does not exist yet is reported as a warning and contributes nothing, so a source can be declared before it is populated. A slug not found in any source fails with an error naming every location searched.

## Packages

A dependency can ship the guidance for using it, and a project adopts it by naming the package (without a filesystem path or a generated file to keep in sync):

```yaml
packages:
  use:
    - '@williamthorsen/nmr'
```

That one line does two things: the package's content directory joins the source search order, and every rulebook, skill, and subagent shipped by the package is deployed. Nothing else is needed, because a package's whole catalog is its declaration, which is also why granularity is all-or-nothing. Adopting a package takes every artifact in its catalog; an individual one cannot be dropped, matching the existing limitation on collection members.

`packages:` is an ordinary declaration block, so `use`, `drop`, and `root: true` behave exactly as they do for an artifact type. A project-local tier can therefore decline a package adopted by the committed tier:

```yaml
# .agents/codeassembly.local.yaml
packages:
  drop:
    - '@williamthorsen/nmr'
```

**Precedence.** Every `sources` entry, from any tier, outranks every package: A directory named by hand should win over a dependency's. Among packages the ordinary rule applies: the highest tier wins, and within a tier the last declared wins. Every shadow is reported by the same warning, whichever two sources it is between, and `sync --dry-run` names the source from which each artifact resolved.

**Resolution.** A declared package resolves through the module resolver, walking the `node_modules` chain searched by Node itself, so it holds under pnpm's hoisting and symlinked layouts. It also holds under a `workspace:*` link, which means a repo that produces a guidance-shipping package consumes its own guidance through the same declaration that a third party writes, resolved against the live source tree rather than a packed copy. A declared package that is not installed, or doesn't declare a content directory, fails the run (dry-run included) before any file is written, naming what was searched. One that declares a content directory that it does not ship warns rather than failing, like any other missing source. The consumer's declaration doesn't contain a path to correct, so the remedy is to create the directory in a package that the consumer maintains, or report the omission upstream in one that they do not.

**Discovery.** `sync` reports any direct dependency that ships content that the project has not declared, printing the `packages:` block that would adopt it. That is advice, not action: An undeclared dependency contributes nothing. Installing one changes nothing about what an agent reads, and `drop` silences the advice for a package that the project has turned down.

Upgrading an already-declared package is the other case. Its catalog is read from the filesystem, so a version that adds an artifact deploys it without a declaration change, the freshness property that makes the rendered guidance a function of what is installed. `sync --dry-run` prints the resolution report naming every artifact and the source from which it came, which is where that change is visible.

### Shipping guidance from a package

A package declares where its content lives with a `codeassembly` key in its `package.json`, pointing at a directory structured like `packages/agents/content/`:

```json
{
  "name": "@williamthorsen/nmr",
  "codeassembly": { "content": "content/agents" },
  "files": ["bin", "content", "dist"]
}
```

```
content/agents/
  collections/
  guidance/rulebooks/
  skills/
  subagents/
```

The key is required and doesn't have a default location. That is deliberate: A default would claim a directory name in every producer's package root, so instead a producer says where its content lives and can nest it under a directory that it already owns, including build output, if a build step puts it there.

A package's catalog is its rulebooks, skills, and subagents; a `collections/` entry is resolvable but not adopted on its own. A collection reaches a consumer only when that consumer declares it by name. Its members are already in the catalog anyway. The way to pull in an artifact from outside the package (a rulebook of another source, say) is a `dependencies:` edge on an artifact that the catalog does contain.

**Shipping support files.** Anything under `skills/` that doesn't contain a `SKILL.md` is a support entry: shared reference content that a skill or rulebook reads at runtime by path, `skills/_data/` being the usual case. A package ships them under its own `skills/`, and they deploy alongside the skills whenever the package is adopted, without a declaration of their own, since nothing names them but the links that reach them.

```
content/agents/
  skills/
    _data/
      house-style.md
    org-review/
      SKILL.md          # links to ../_data/house-style.md
```

Each source's support entries deploy into a namespace of their own, under `skills/_sources/<source-name>/`, so the CodeAssembly library and any number of packages can each ship a `_data/house-style.md` without one masking another. A scoped package name nests as its own segments (`_sources/@williamthorsen/nmr/`). Author links relative to the file's own place in the content tree, and delivery rewrites them to wherever they are deployed; a source name that could not name a directory fails the run rather than being silently reshaped.

`_partials/` is the exception, being an include target inlined into the files that include it rather than a file that deploys.

**Include the content directory in `files`.** This is the one thing most likely to go wrong, because a `workspace:*` self-link resolves the live source tree and so never exercises packing. A producer that omits the entry sees its own guidance work perfectly and every consumer's install fail. `pnpm pack` and inspecting the tarball is the check that catches it.

Authoring the artifacts themselves is no different from authoring library content; see the content specification for frontmatter fields, `dependencies:`, `members:`, and invocation tokens. A package's content directory is a content root, so it contains a `codeassembly-content.yaml` like any other; see [Content-format version](#content-format-version).

**Gate the content in the producer's own build.** `codeassembly validate` runs the checks that a consumer's `sync` runs before writing (dependency closure, artifact resolution, delivery collisions, and a per-harness render) over the whole content root, writing nothing:

```
codeassembly validate
```

Because it doesn't read any `codeassembly.yaml`, a package that produces guidance without consuming any still has a gate: Wire it into the repo's `check` and a defect fails the producer's build instead of the next consumer's install. The root comes from `--content <dir>`, or from the `codeassembly.content` key above when the flag is absent; neither yielding one is an error naming both routes. `--harness` narrows the run, and the default checks every harness to which the root could deploy, since a defect can reach only one. A clean root exits 0; any defect exits 1 after a report grouped by file. Some checks don't have a `sync` counterpart, and catch what nothing else would: a skill declaring the retired `harnesses:` key, which narrows nothing and survives into the deployed file rather than failing anywhere; a relative link whose file is missing or whose `#fragment` names zero or several headings; a non-breaking space in an authored file; a helper-script invocation without the `{harness_home_dir}/scripts/` prefix; an include or guidance-hook directive followed by a heading that would nest under the injected content; a support-entry token that resolves nowhere, or whose section a linking skill or subagent does not declare; and a relative link, or a skill named in prose that does not deploy to every harness, in shared guidance.

Coverage is what the root ships that reaches a consumer: rulebooks, skills, subagents, collections, and the support entries under `skills/` that don't contain a `SKILL.md`. The root resolves alone: A link target, a dependency edge, or an invocation token that names something the root does not contain is a defect.

One shape cannot consume its own guidance: A single-package repo whose package is the repo root doesn't have a `workspace:*` self-link to resolve through. Such a repo declares a `sources:` entry pointing at the directory instead.

## References

A dependency can ship documentation written for agents without shipping CodeAssembly content. A top-level `references:` list points the agent at it, by package name and a path inside the package:

```yaml
references:
  - name: nextjs-docs
    package: next
    path: dist/docs
    summary: Read the guide for the installed Next.js version before writing App Router code.
  - name: web-docs
    package: some-web-only-package
    path: docs/agents.md
    summary: Read this before changing the web app's data layer.
    resolve-from: apps/web
```

Each entry has a kebab-case `name`, the `package` to resolve, a `path` inside it (a file or a directory), and a `summary`, all required. `sync` writes one block per reference into the ambient region of every targeted harness, after the rulebook blocks: the `summary` as written, then `Location:` with the resolved path. Nothing is read from the target or copied into the repository, so the pointer follows whichever version is installed. A reference does not resolve a slug or shadow anything, so the precedence of `sources` and `packages` does not apply to it.

**Precedence.** Entries are keyed by `name`: A higher tier that repeats a name replaces the lower tier's entry, and `root: true` clears the list.

**Resolution.** The package resolves as Node resolves it, walking the `node_modules` chain upward from the directory that contains `.agents/`, or from `resolve-from` when the entry sets it. `resolve-from` is relative to that same directory; a workspace uses it to name the member whose `package.json` depends on the package when the root does not. The written path is the `node_modules` path, not its realpath, so it stays valid across an upgrade that keeps the path. Under `sync --global`, a path inside the home directory is written with `~` in place of that directory. `sync --dry-run` names each reference's resolved path.

**Failure.** A reference whose `resolve-from` is not a directory, whose package is not installed, or whose `path` is absolute, leaves the package, or does not exist fails the run before any file is written, dry run included. The report names the declaring `codeassembly.yaml`, and the region written by an earlier run stays as it was.

## Content-format version

A content root and the tool that deploys it are released separately, so a checkout can be newer than the `codeassembly` reading it. In a `codeassembly-content.yaml` at its top level, a root states the format contract against which it was authored, a `sources:` path and a `packages:` content directory alike:

```yaml
# content/codeassembly-content.yaml
format: 1
```

The tool holds the set of formats that it supports and refuses a root declaring any other, before any file is written and `--dry-run` included, naming the root, the format that it declares, and the formats supported. `sync`, `sync --global`, and `install` fail; `validate` reports it as a defect and exits 1. The remedy is to upgrade `codeassembly` to a version that supports the declared format.

**A root without a manifest is format 1**, which keeps a producer that predates the manifest working unchanged. A manifest that exists states its format: An absent or malformed `format` fails rather than passing as format 1, so every manifest that exists is self-describing.

Unknown keys pass through. A later tool can read a key that an older one ignores without the older one rejecting a root that it would otherwise honor. `helpers:` declares the TypeScript helpers that the root bundles, and only `bundle-helpers` reads it; see [Bundling helpers](bundling-helpers.md), which also covers the optional `esbuild` peer that the command needs.

**What a bump obliges.** The format version names the contract that the tool implements (frontmatter keys, invocation tokens, directives, and content-root layout), so it rises when content authored against the new contract would deploy wrongly under the old one rather than failing outright. Adding a key nothing older depends on does not need one; changing what an existing key means does.

| Format | Contract                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1      | The contract documented here.                                                                                                   |
| 2      | Adds the optional invocation-token form, `{skill?:<slug>}` and `{subagent?:<slug>}`, which names a target without deploying it. |

## Scopes

The declaration resolves in two independent **domains**, each with its own base and local tiers and its own deployment target. The tiers within a domain run lowest to highest precedence.

**Repo domain**: `codeassembly sync`, deploying into the repo:

1. **Project**: `.agents/codeassembly.yaml`, committed and shared with the team.
2. **Project-local**: `.agents/codeassembly.local.yaml`, gitignored, for personal overrides.

**Home domain**: `codeassembly sync --global`, deploying into the home harness directories (`~/.claude`, `~/.rovo`) and `~/.agents/`:

1. **User-global**: `~/.agents/codeassembly.yaml`, created by `init --global` (declares `all` by default).
2. **User-global-local**: `~/.agents/codeassembly.local.yaml`, for personal overrides that survive reinstalls.

A higher tier adds to and overrides the tiers below it _within the same domain_: `use` adds an entry, `drop` removes one contributed by a broader tier in that domain, and `root: true` discards everything from broader tiers in that domain. Artifact keys never cross the domains: A project tier cannot `drop` a user-global rulebook, skill, subagent, or collection, and bare `sync` never writes the home directories (it refuses to run when invoked from the home directory, directing the caller to `sync --global`). `harnesses` is the one deliberate exception: Which harnesses a developer runs is a fact about the developer rather than about either domain's catalog, so it resolves across both tiers (see [Harness targeting](#harness-targeting)). Guidance-hook bindings do not cross either: `sync` resolves the project chain and `sync --global` the home chain, and neither sees the other. A project that deploys a hook-bearing skill therefore shadows the user's bound home copy with one bound only by the project's own chain. Guidance bound globally by the developer goes missing in that repository until the project binds it too. In both domains, ambient rulebooks are injected into the ambient region of a per-harness guidance file loaded by the harness at launch. In the repo domain the host is each targeted harness's machine-local project guidance file at the project root (`CLAUDE.local.md`, `AGENTS.local.md`), which `sync` creates when the project declares an ambient rulebook and appends its region to when the file already exists; because that host is gitignored, a multi-worktree checkout needs a sync per worktree (see [Keeping deployed guidance current](../README.md#keeping-deployed-guidance-current)). In the home domain the host is each targeted harness's guidance file (`~/.claude/CLAUDE.md`, `~/.rovo/AGENTS.md`), whose region's location comes from `install`'s rendered template while its content belongs to `sync --global`: `install` preserves the region across re-renders and ignores it for drift detection, while hand edits elsewhere in those files still count as drift. Run `install` once before the first `sync --global` so that the region exists to fill; a guidance file without the region is skipped with a warning. `sync --global` also retires a legacy `~/.agents/GLOBAL.md`, removing its sync-owned blocks and deleting the file unless it holds hand-written content; `install` and `uninstall` retire a legacy `~/.agents/AGENTS.md` the same way, removing a copy deployed by the CLI and keeping one that holds hand-written content. For per-machine ambient guidance that should stay out of source control, declare a machine-local source (see [Sources](#sources)) holding a personal rulebook with `delivery: ambient`. In both domains, the deployed Rovo Dev skills are indexed into `.rovo/prompts.yml` so that they surface in Rovo Dev's available-skills list; `sync` owns a single sentinel-delimited region in that file and leaves any hand-authored entries outside it untouched, in the home file as well as the project file.

When upgrading from a build in which `install` deployed the catalog, run `install` once before `sync --global`: The new `install` prunes the skills and the whole-file `prompts.yml` it previously planted, and `sync --global` then re-deploys the skills as sync-owned and rewrites `prompts.yml` as a merged region. Running `sync --global` first stops at a refuse-to-overwrite error on those still-`install`-owned skill files, and would merge its region beneath the stale whole-file `prompts.yml` entries until the next `install` prunes them.

### Designated home-domain writer

Every repository and worktree has a `codeassembly` binary of its own, at the version that its own checkout holds. `install` and `sync --global` write the shared home domain, so whichever binary ran last decides how the home state is rendered. An older one silently overwrites a newer one's output, and its orphan retraction deletes what it does not recognize.

`home-writer` names the one installation allowed to write:

```yaml
# ~/.agents/codeassembly.local.yaml
home-writer: ~/repos/projects/codeassembly.live
```

The setting reads from the home domain's chain alone, the local tier overriding the base one, and it takes an absolute path (a leading `~` expands to the home directory). A project declaration that sets it is rejected by name, since a machine's designated writer is not a fact that a repository can state. It may name either a worktree root or the package directory within it: The guard passes when the running package's root is that path or lies under it, comparing both through symlinks.

With the setting present, `install` and `sync --global` invoked from any other installation refuse before writing anything, naming the designated path, the invoking one, and the file that configured it. `--dry-run` refuses identically, so a preview never reports a write that the real run would reject. `--override-writer` proceeds from a non-designated installation and says so in the output.

With the setting absent, any installation may write the home domain, and an external consumer doesn't need any configuration. Removing the key is how to stop designating a writer; an empty or relative value fails the run rather than quietly disabling the guard.

### Home-domain provenance

Every non-dry-run `install` and `sync --global` records what it wrote to `~/.codeassembly/home-provenance.json` under `lastWrite`: the version of the package whose binary ran, its source path, the commit that source sat on when one is resolvable, the command, and a timestamp. A dry run leaves the file untouched, so the stamp reports what wrote rather than what was previewed.

The same commands record the attempt under `lastAttempt`, on a failure as well as on a success: its command, a timestamp, the outcome, and, when the run failed, the rendered failure and how many defects it reported. A failed attempt writes nothing else. `lastWrite` keeps naming the deployment still in effect. The attempt separates a current deployment from one left behind by an abandoned run: A write timestamp alone reads the same on a machine that has not needed a sync and on one whose sync has been failing for a fortnight. The attempt is recorded only past the designated-writer guard, so an installation refused by the guard leaves the home domain's record untouched.

The write fields are also mirrored at the top level of the file, which is where a `codeassembly` predating `lastWrite` reads them. Because every repository and worktree has a binary of its own, a machine part-way through an upgrade is the ordinary case rather than an edge one.

`codeassembly status` renders the stamp as its first line:

```
Home domain last written by 0.8.0 at /Users/me/repos/codeassembly.live/packages/agents @ a1b2c3d via `sync --global` on 2026-08-09T20:05:09.412Z
```

When the last attempt failed, `status` leads with that and dates the guidance still in effect:

```
⚠️ The last home-domain write attempt failed: `sync --global` on 2026-08-23T14:02:11.907Z, with 3 defect(s), writing nothing.
Home domain last written by 0.8.0 at /Users/me/repos/codeassembly.live/packages/agents @ a1b2c3d via `install` on 2026-08-09T20:05:09.412Z (14 day(s) old)
```

A home domain last written by a build predating the stamp doesn't have a line to show, and `status` prints none. One recording a failed attempt without any write at all reports the attempt and says so.
