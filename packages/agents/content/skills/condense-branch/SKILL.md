---
name: condense-branch
description: Squash branch commits into a single well-described commit
user-invocable: true
---

# Condense branch

Condense the current branch into a single commit with a comprehensive message.

## Process

1. **Stash changes** if working tree is dirty

2. **Analyze branch** to create a good commit message, and consolidate it while its commits still exist:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch` from the manifest JSON it emits on stdout.
   - Consolidate the range into a scratch file, created per the path rules of [gh body file](#gh-body-file) and named `consolidation-{timestamp}.json`:

     ```bash
     consolidation_path="{absolute path from the scratch-directory step}"
     node {harness_home_dir}/scripts/describe-change.mjs consolidate-branch --base {default_branch} > "$consolidation_path" && cat "$consolidation_path"
     ```

     If the call fails, as it does when `commit.title_format` is empty, it leaves the file empty. Relay its error and continue without a consolidated record: the subject renders with no scope or type, and the message carries no trailer.

   - Report each `unmatched` subject and each `violations` entry to the developer. An unmatched subject gets no trailer in step 4, so it drops out of the entries that the condensed commit declares.

   [The change record](../_data/change-record.md) states the consolidated record and the `Change:` trailer.

3. **Create backup branch**:

```bash
git branch $(git branch --show-current)-v1
```

If branch exists, increment version number.

4. **Condense commits**:

   Write the title, a blank line, and the body to a scratch file per [gh body file](#gh-body-file), naming it `commit-message-{timestamp}.md`; do not inline the message into the shell command.

   The call below composes the final message from that file and the step-2 consolidation: the body, a blank line, and one `Change: {change}` trailer per entry, oldest first, as the last paragraph. The trailers are read from the consolidation file inside the call, so no entry is retyped into a command, and a retry rebuilds the message rather than appending to it. If the consolidation found no entry, or failed and left the file empty, the message carries no trailer.

   ```bash
   body_path="{absolute path from the write step}"
   consolidation_path="{absolute path of the step-2 consolidation file}"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   message_path="${body_path%.md}-with-trailers.md"
   {
     cat "$body_path"
     if [ -s "$consolidation_path" ]; then
       printf '\n\n'
       jq -r '.entries[] | "Change: " + .change' "$consolidation_path"
     fi
   } > "$message_path"
   git reset --soft $(git merge-base {default_branch} HEAD)
   git add --all
   git commit --file "$message_path" --no-gpg-sign --no-verify
   ```

## Commit message creation

### If commits have detailed descriptions

Synthesize existing descriptions to describe the final result. Lead the first paragraph with what the branch accomplishes as a whole; use subsequent paragraphs for implementation details. Omit information that's no longer relevant (e.g., changes made then reversed).

### If commits lack detail

Use `{skill:summarize-change}` to compose a good commit message. Save the description per standard artifact conventions.

## Commit format

Compose the message per `{rulebook:commit-conventions}`. Use `describe-change.mjs` to render the full commit title (see [title-templates.md](../_data/title-templates.md) for syntax), taking `{scope}` and `{type}` from the step-2 `consolidated_record` and appending `!` to the type if it is breaking. If the consolidation failed, or a field is `null`, omit that flag:

<!-- include: ../_partials/commit-title-rendering.md / -->

## Safety

- Always create a backup branch before condensing
- Increment version numbers if backup already exists
- Use `--no-gpg-sign --no-verify` to avoid hook issues

<!-- include: ../_partials/gh-body-file.md / -->
