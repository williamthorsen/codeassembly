---
name: capture-feedback
description: Capture feedback on agent behavior as a guidance-refinement candidate — apply the immediate fix when concrete, then record the generalized lesson. Use when correcting a misapplied rule or specifying a new desired behavior.
user-invocable: true
---

# Capture feedback

Record feedback on the agent's behavior as evidence for a future guidance refinement, applying the immediate fix when there is something concrete to change. The user describes a correction or a desired behavior, the agent applies it when applicable, and the agent appends a generalized record that a later recall-driven pass reads to refine guidance.

The actual guidance refinement is **deferred** — this skill captures the candidate, it does not edit the skill, subagent, rulebook, general guidance, or helper. A later pass refines the guidance in bulk, recalling the accumulated `feedback` records together, so a single data point never over-fits a rule.

**Announce at start:** "Using capture-feedback to apply this and record it for guidance refinement."

## When to use

Invoke `{skill:capture-feedback}` whenever the user gives feedback that should change how the agent behaves — either:

- **Correcting a misapplied rule** — the agent broke guidance that already exists (for example, title-cased a heading when the sentence-case rule was in force).
- **Specifying a new desired behavior** — the user wants a behavior that no current guidance covers.

Both are captured the same way; the difference is recorded in the tags.

## Runtime dependencies

- **`node` ≥ 24** — the capture runs through `{skill:capture-event}`'s bundled helper, which inherits the Node version floor of `@williamthorsen/kb`.
- **A `kb.yaml` registry declaring the destination store** — `--store` resolves through `.agents/kb.yaml` in the project or `~/.agents/kb.yaml`, and `@default` resolves only where that registry configures a `default_kb`. Where no registry declares a usable destination, apply the immediate fix, then report that the record went uncaptured and name what a registry would need. Never retry against a guessed store name.

## Process

### 1. Classify the feedback

Decide one question: **Did relevant guidance already exist?**

- **Yes — misapplied existing guidance.** A rule was in force and the agent missed it. This is a mistake plus its correction.
- **No — no such guidance.** The user is establishing a net-new expectation. There is no mistake, only a refinement to propose.

Assess this best-effort from the guidance you can see. When you genuinely cannot tell, record the uncertainty in the body rather than forcing the call.

### 2. Apply the immediate fix

If the feedback names a concrete artifact — something the agent produced, such as code, a doc, a PR body, or a ticket — apply the fix:

- **Apply it directly, without asking for approval.** Invoking this skill and describing the fix is the authorization.
- **Confirm first only when the fix is genuinely ambiguous** (more than one reasonable reading of what to change) **or risky, large, or hard to reverse.** Then state the change you intend to make and wait for a go-ahead before applying.

If the feedback is purely behavioral — a standing rule with nothing to fix right now — skip this step.

### 3. Capture the record

Invoke the `{skill:capture-event}` skill to append the record, composing its arguments and body as follows:

- `--store <name|@default>` — the KB containing the guidance the record would refine. That subject is what makes `capture-event`'s project-versus-environment rule decidable here: A lesson about one project's own skills, rulebooks, or instructions goes to that project's KB by name, and a lesson about guidance the agent applies in every project goes to `@default`.
- `--tags feedback` — always. Add `,mistake` when existing guidance was misapplied (step 1, "Yes").
- `--skill <slug>` — when the refinement target is a skill.
- `--impact <level>` — optionally rate how much addressing this feedback would improve the agent's future behavior: `low`, `medium`, `high`, or `critical`. Omit it when you have no clear read; the rating is revisable later with `kb-update-events`.
- `--summary` — a one-line recall label, for example "Agent title-cased a heading; sentence case is the rule."
- **Body** — the generalized lesson, only to the extent needed to act on it later:
  - The **error→correction pair** (misapplied-guidance mode) or the **desired behavior** (no-guidance mode), generalized — not the raw artifact or diff.
  - A **best-effort candidate refinement target**: the guidance artifact and its type (skill, subagent, rulebook, general guidance, or helper). Use `--skill` for a skill target; name the artifact in the body for the other four. Write "candidate: undetermined" when you genuinely cannot place it.
  - Any uncertainty about the classification from step 1.

### 4. Report

State what was fixed — or that the feedback was behavioral-only — and the captured record's id and path. Where no registry declared a destination, say so in place of the id and path.

If the user then says the record is inaccurate, correct it in place with `capture-event --amend <id>` rather than capturing a second record — amend rewrites the record in place. Capture a fresh record only when the correction is a genuinely distinct lesson.

## Completion

The immediate fix is applied (when applicable) and a `feedback`-tagged record is written, ready for a later refinement pass to recall by that tag.
