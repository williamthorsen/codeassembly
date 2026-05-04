# Ticket ID extraction (Jira-style)

This is the canonical contract for extracting a Jira-style ticket ID from a branch name or commit message subject. Both the `get-ticket-id` skill (Bash) and the `get-session-context` skill (zero-Bash spec) implement this contract; downstream callers rely on the two implementations producing identical results for the same input.

## Contract

- **Pattern (case-insensitive):** `[A-Za-z]{2,}-[0-9]+`. Two or more letters, a hyphen, one or more digits. Single-letter prefixes (`a-1`, `x-99`) are not valid ticket IDs.
- **Position:** matched anywhere in the input. The first match wins.
- **Output normalization:** the captured ID is uppercased before being returned (`mac-130` → `MAC-130`).
- **Suffix tolerance:** trailing `.N` (sub-ticket) and `-description` segments are accepted in input but are not part of the canonical ID. The greedy `[0-9]+` boundary stops at any non-digit (`.`, `-letter`, `/`, `_`, end-of-string), so these suffixes are naturally truncated — no post-match stripping is required.

## Behavior table

The following inputs are the test oracle for both implementations.

| Input                       | Output         |
| --------------------------- | -------------- |
| `MAC-130`                   | `MAC-130`      |
| `mac-130`                   | `MAC-130`      |
| `wt/compPlaN-795`           | `COMPPLAN-795` |
| `wthorsen/MAC-130`          | `MAC-130`      |
| `wt/jira-123.1-some-suffix` | `JIRA-123`     |
| `jira-123-1`                | `JIRA-123`     |
| `MAC-147-some-description`  | `MAC-147`      |
| `feat-2`                    | `FEAT-2`       |
| `feat/foo-2`                | `FOO-2`        |
| `main`                      | _(empty)_      |

Two of these cases are surprising in isolation but follow directly from the contract:

- `feat-2 → FEAT-2`: `feat` is a valid two-or-more-letter prefix, so `feat-2` matches the Jira-style shape. Branch slugs that happen to start with a kebab-case word followed by a digit will be picked up as ticket IDs.
- `feat/foo-2 → FOO-2`: the match is unanchored, so `foo-2` later in the string matches even though `feat/` does not.

This is intentional — case-insensitive unanchored matching is the price of supporting `wt/mac-130` and `wthorsen/MAC-130` uniformly. Callers that want stricter shapes should not rely on this contract; use the bare-numeric fallback (described below) instead.

## Bare-numeric fallback (out of scope)

When no Jira-style ID matches, the `get-ticket-id` script falls back to a **bare numeric prefix** anchored at the start of the input, formatted via `project.ticket_ref_prefix` from `.agents/preferences.yaml`. That fallback is a separate, orthogonal feature for `#`-style projects and is not covered by this contract. See `extract_bare_number` in `packages/agents/content/scripts/get-ticket-id.sh` for the implementation, and `get-session-context/SKILL.md` rules 6–7 for the spec equivalent.
