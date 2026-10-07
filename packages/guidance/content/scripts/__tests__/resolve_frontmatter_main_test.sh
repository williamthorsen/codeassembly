#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/resolve-frontmatter.sh"

Describe "main"
BeforeEach "enter_tmpdir"
AfterEach "leave_tmpdir"

It "exits non-zero with a diagnostic when --skill is missing in yaml mode"
When run main --format yaml --interactive true
The status should be failure
The stderr should include "--skill is required"
End

It "exits non-zero with a diagnostic when --interactive is missing in yaml mode"
When run main --format yaml --skill foo
The status should be failure
The stderr should include "--interactive is required"
End

It "exits non-zero with a diagnostic when --format is xml"
When run main --format xml --skill foo --interactive true
The status should be failure
The stderr should include "unknown --format"
End

It "exits non-zero with a diagnostic when --interactive value is neither true nor false"
When run main --format yaml --skill foo --interactive maybe
The status should be failure
The stderr should include "--interactive must be true or false"
End

Context "when git cannot read the repository"
setup_unreadable_repo() {
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
}

BeforeEach "setup_unreadable_repo"

It "names the unreadable repository rather than an unresolvable branch"
# `GIT_DIR` points nowhere while the working directory is a healthy repository, which is the shape produced by a
# sandboxed nested `git`: The repository is present and git refuses to read it.
run_unreadable_repo() {
  GIT_DIR=/nonexistent/x main --skill foo --interactive true
}
When run run_unreadable_repo
The status should be failure
The stderr should include "cannot read the git repository"
The stderr should include "fatal:"
The stderr should not include "could not resolve the current branch"
End
End

Context "when git cannot resolve the branch"
setup_unborn_head() {
  # No commit: `git rev-parse --git-dir` succeeds while `--abbrev-ref HEAD` fails, which is the only
  # condition that reaches the branch diagnostic past the readability probe.
  git init --quiet --initial-branch=main .
}

BeforeEach "setup_unborn_head"

It "quotes git's diagnostic rather than naming a cause"
When run main --skill foo --interactive true
The status should be failure
The stderr should include "git could not resolve the current branch"
The stderr should include "fatal:"
The stderr should not include "cannot read the git repository"
End
End
End

Describe "main missing manifest invokes the bundled deriver"
setup_missing_manifest() {
  enter_tmpdir || return 1
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
  # `.agents/main.branch-manifest.json` does not exist, so the deriver must write one.
  # Point the bundle resolver at the on-disk bundle. shellspec sources this script via `Include`,
  # so the script's own `BASH_SOURCE[0]`-based path computation resolves to the shellspec runner
  # rather than the agents content tree.
  export RESOLVE_FRONTMATTER_BUNDLE_PATH="$PROJECT_ROOT/content/skills/derive-session-context/derive-session-context.mjs"
  # `--home` points the deriver at the tmpdir so that it does not read the real
  # `~/.agents/preferences.yaml`, whose schema-validity is environment-specific. A `HOME` env
  # override would break PATH-resolution tools such as asdf shims.
  export RESOLVE_FRONTMATTER_BUNDLE_ARGS="--home $tmpdir"
}

cleanup_missing_manifest() {
  unset RESOLVE_FRONTMATTER_BUNDLE_PATH RESOLVE_FRONTMATTER_BUNDLE_ARGS
  leave_tmpdir
}

BeforeEach "setup_missing_manifest"
AfterEach "cleanup_missing_manifest"

It "derives and writes the manifest when none exists, then succeeds"
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
When run main --skill foo --interactive true
The status should be success
The output should include "skill: foo"
The output should include "branch: main"
The path "$resolved_tmpdir/.agents/main.branch-manifest.json" should be exist
End

It "derives the manifest at the repo root when invoked from a nested subdirectory"
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
mkdir -p packages/nested/deep
subdir_run() {
  pushd packages/nested/deep >/dev/null
  main --skill foo --interactive true
  local rc=$?
  popd >/dev/null
  return $rc
}
When run subdir_run
The status should be success
The output should include "skill: foo"
The output should include "branch: main"
The path "$resolved_tmpdir/.agents/main.branch-manifest.json" should be exist
The path "$resolved_tmpdir/packages/nested/deep/.agents/main.branch-manifest.json" should not be exist
End

It "recovers when the cached manifest contains corrupt JSON"
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
mkdir -p .agents
printf '{ "ticket_id": "broken' >.agents/main.branch-manifest.json
When run main --skill foo --interactive true
The status should be success
The output should include "skill: foo"
The output should include "branch: main"
The stderr should include "manifest"
The stderr should include "is corrupt"
The path "$resolved_tmpdir/.agents/main.branch-manifest.json" should be exist
End
End

Describe "main end-to-end"
setup_main_e2e() {
  enter_tmpdir || return 1
  # Initialize a minimal git repository so that `current_branch` and `git rev-parse --short HEAD` succeed.
  git init --quiet --initial-branch=537 .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
  mkdir -p .agents
  printf "project:\n  ticket_ref_prefix: '#'\n" >.agents/preferences.yaml
  export RESOLVE_FRONTMATTER_BUNDLE_PATH="$PROJECT_ROOT/content/skills/derive-session-context/derive-session-context.mjs"
  export RESOLVE_FRONTMATTER_BUNDLE_ARGS="--home $tmpdir"
}

cleanup_main_e2e() {
  unset RESOLVE_FRONTMATTER_BUNDLE_PATH RESOLVE_FRONTMATTER_BUNDLE_ARGS
  leave_tmpdir
}

BeforeEach "setup_main_e2e"
AfterEach "cleanup_main_e2e"

It "emits extension fields end-to-end and force-omits a resolved field via --override KEY="
When run main \
  --skill foo \
  --interactive true \
  --extra "alpha=1" \
  --extra-list "tags=a,b" \
  --override "ticket_id="
The status should be success
The output should include "skill: foo"
The output should include "isInteractive: true"
The output should include "alpha: 1"
The output should include "tags: [a, b]"
The output should not include "ticket_id"
End

It "emits run_id only when supplied via --override run_id="
When run main --skill foo --interactive true --override "run_id=20260516-143946Z"
The status should be success
The output should include "run_id: 20260516-143946Z"
End

It "omits run_id when a leftover run breadcrumb is present and --override run_id is not given"
mkdir -p .claude/tmp
echo "/some/path/20260516-143946Z" >.claude/tmp/active-run-dir
When run main --skill foo --interactive true
The status should be success
The output should not include "run_id"
End

It "accumulates repeated --extra-list-item flags into one flow list, in the order given"
When run main \
  --skill foo \
  --interactive true \
  --extra-list-item "changes=first" \
  --extra-list-item "changes=second"
The status should be success
The output should include "changes: [first, second]"
End

It "keeps an --extra-list-item value carrying a comma whole"
When run main \
  --skill foo \
  --interactive true \
  --extra-list-item "changes=agents|feat: Add a parser, a renderer, and a verifier"
The status should be success
The output should include "changes: ['agents|feat: Add a parser, a renderer, and a verifier']"
End

It "emits a single --extra-list-item as a one-item list"
When run main \
  --skill foo \
  --interactive true \
  --extra-list-item "changes=only"
The status should be success
The output should include "changes: [only]"
End

It "emits pr only when supplied via --override pr="
When run main \
  --skill foo \
  --interactive true \
  --override "pr=https://github.com/o/r/pull/7"
The status should be success
The output should include "pr: https://github.com/o/r/pull/7"
End

It "omits pr when --override pr is not given"
When run main --skill foo --interactive true
The status should be success
The output should not include "pr:"
End

It "resolves the manifest when invoked from a nested subdirectory"
mkdir -p packages/nested/deep
pushd packages/nested/deep >/dev/null
result=$(main --skill foo --interactive true 2>&1)
status=$?
popd >/dev/null
When call test "$status" -eq 0
The status should be success
The variable result should include "skill: foo"
The variable result should include "ticket_id: 537"
End

It "stamps ticket values derived from the current preferences over a manifest already on disk"
printf '{ "ticket_id": "537", "ticket_ref": "#537" }\n' >.agents/537.branch-manifest.json
printf "project:\n  ticket_ref_prefix: 'ABC-'\n" >.agents/preferences.yaml
When run main --skill foo --interactive true
The status should be success
The output should include "ticket_id: ABC-537"
The output should include "ticket_ref: ABC-537"
End
End
