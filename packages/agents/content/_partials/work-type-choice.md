**Choosing a work type.** Whom a change affects decides its type, not the format of its files. Apply the descriptions in `{harness_home_dir}/skills/_data/work-types.json` to the change itself. Never infer a type from how earlier changes were typed, because many were typed wrongly.

- **Repo-agnostic guidance is source code.** Skills, skill data, partials, subagent definitions, and rulebooks written for use in any repository take the type that the same change to source code would take. A wording correction, including the repair of a writing-rule violation, is `fix`. A restructuring is `refactor` only when it leaves the text read by the agent unchanged, as extracting a partial does. A token cut that changes no behavior is `perf`.
- **Guidance on working in one repository is `ai`.** That repository's `AGENTS.md`, its repo-local skills, and its agent configuration take `ai`.
- **Guidance to agents is never `docs`.** `docs` is documentation for human readers, and a change confined to code comments is `docs`.
- **Content decides.** What guidance says decides whether it is repo-agnostic, not its file name, location, or format.
