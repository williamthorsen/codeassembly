---
name: condense-branch
description: Squash branch commits into a single well-described commit
user-invocable: true
---

# Condense branch

Condense the current branch into a single commit with a comprehensive message.

## Process

1. **Stash changes** if working tree is dirty

2. **Analyze branch** to create a good commit message, and classify it while its commits still exist:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch` from the manifest JSON it emits on stdout.
   - Classify the range into a scratch file, created per the path rules of [gh body file](#gh-body-file) and named `classify-{timestamp}.json`:

     ```bash
     classify_path="{absolute path from the scratch-directory step}"
     node {harness_home_dir}/scripts/describe-change.mjs consolidate-branch --base {default_branch} > "$classify_path" && cat "$classify_path"
     ```

     Where the call fails, as it does when `commit.title_format` is empty, it leaves the file empty. Relay its error and continue without a classification: the subject renders with no head, and the message carries no trailer.

   - Report each `unclassified` commit and each `violations` entry to the developer. An unclassified commit gets no trailer in step 4, so its subject leaves the branch's record.

   [The change record](../_data/change-record.md) states the classification and the `Change:` trailer.

3. **Create backup branch**:

```bash
git branch $(git branch --show-current)-v1
```

If branch exists, increment version number.

4. **Condense commits**:

   Write the title, a blank line, and the body to a scratch file per [gh body file](#gh-body-file), naming it `commit-message-{timestamp}.md`; do not inline the message into the shell command.

   The call below composes the final message from that file and the step-2 classification: the body, a blank line, and one `Change: {change}` trailer per entry, oldest first, as the last paragraph. The trailers are read from the classification file inside the call, so no entry is retyped into a command, and a retry rebuilds the message rather than appending to it. Where the classification found no entry, or failed and left the file empty, the message carries no trailer.

   ```bash
   body_path="{absolute path from the write step}"
   classify_path="{absolute path of the step-2 classification file}"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   message_path="${body_path%.md}-with-trailers.md"
   {
     cat "$body_path"
     if [ -s "$classify_path" ]; then
       printf '\n\n'
       jq -r '.entries[] | "Change: " + .change' "$classify_path"
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

Compose the message per `{rulebook:commit-conventions}`. Use `describe-change.mjs` to render the full commit title (see [title-templates.md](../_data/title-templates.md) for syntax), taking `{scope}` and `{type}` from the step-2 `head` and appending `!` to the type where the head is breaking. Where the classification failed, or `head` is `null` or names no scope, omit that flag:

<!-- include: ../_partials/commit-title-rendering.md / -->

## Safety

- Always create a backup branch before condensing
- Increment version numbers if backup already exists
- Use `--no-gpg-sign --no-verify` to avoid hook issues

<!-- include: ../_partials/gh-body-file.md / -->
