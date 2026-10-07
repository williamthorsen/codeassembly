#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/resolve-frontmatter.sh"

Describe "sanitize_branch"
It "replaces forward slashes with hyphens"
When call sanitize_branch "feat/foo/bar"
The output should equal "feat-foo-bar"
End

It "strips trailing hyphens"
When call sanitize_branch "feat/"
The output should equal "feat"
End

It "leaves names without slashes unchanged"
When call sanitize_branch "537"
The output should equal "537"
End

It "preserves underscores"
When call sanitize_branch "MAC-130_foo"
The output should equal "MAC-130_foo"
End

It "strips all trailing hyphens produced by consecutive slash replacement"
# `feat//` -> `feat--` after `/` replacement; loop must strip both to match the TS deriver,
# which computes the manifest filename via the same sanitization.
When call sanitize_branch "feat//"
The output should equal "feat"
End
End

Describe "resolve_manifest_path"
setup_repo() {
  enter_tmpdir || return 1
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
}

cleanup_repo() {
  leave_tmpdir
}

Context "inside a git repository"
BeforeEach "setup_repo"
AfterEach "cleanup_repo"

It "returns the repo-root-anchored absolute path for a simple branch"
# Resolve symlinks so that the comparison matches `git rev-parse --show-toplevel`, which always reports the canonical
# path (e.g. on macOS `/tmp` -> `/private/tmp`).
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
When call resolve_manifest_path "main"
The output should equal "$resolved_tmpdir/.agents/main.branch-manifest.json"
The status should be success
End

It "returns the same absolute path when invoked from a nested subdirectory"
mkdir -p packages/nested/deep
pushd packages/nested/deep >/dev/null
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
result=$(resolve_manifest_path "main")
popd >/dev/null
When call echo "$result"
The output should equal "$resolved_tmpdir/.agents/main.branch-manifest.json"
End

It "applies sanitize_branch semantics to the branch token"
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
When call resolve_manifest_path "feat/foo/bar"
The output should equal "$resolved_tmpdir/.agents/feat-foo-bar.branch-manifest.json"
End
End

Context "outside a git repository"
BeforeEach "enter_tmpdir"
AfterEach "leave_tmpdir"

It "returns non-zero with empty stdout outside a git repository"
When call resolve_manifest_path "main"
The output should equal ""
The status should be failure
End
End
End

Describe "resolve_base_sha"
It "returns empty for unresolvable refs (no stderr leak)"
When call resolve_base_sha "origin/this-ref-does-not-exist-anywhere"
The output should equal ""
End

It "returns the short SHA for a valid ref"
ref=$(git rev-parse --short HEAD)
When call resolve_base_sha "HEAD"
The output should equal "$ref"
End
End

Describe "add_extra"
add_extra_setup() {
  unset extra_keys extra_values extra_kinds
  declare -ga extra_keys=()
  declare -gA extra_values=()
  declare -gA extra_kinds=()
}

BeforeEach "add_extra_setup"

It "records insertion order across mixed extra kinds"
add_extra "scalar" "title=hello" extra_keys extra_values extra_kinds
add_extra "list" "commits=a,b" extra_keys extra_values extra_kinds
add_extra "scalar" "scope=root" extra_keys extra_values extra_kinds
When call test "${#extra_keys[@]}" -eq 3
The status should be success
End

It "splits the key on the first equals sign"
add_extra "scalar" "title=a=b=c" extra_keys extra_values extra_kinds
When call echo "${extra_values[title]}"
The output should equal "a=b=c"
End

It "tracks the kind per key"
add_extra "list" "commits=a,b" extra_keys extra_values extra_kinds
When call echo "${extra_kinds[commits]}"
The output should equal "list"
End

It "fails when the argument does not contain an equals sign"
When run add_extra "scalar" "bad_arg" extra_keys extra_values extra_kinds
The status should be failure
The stderr should include "missing '='"
End

It "fails when the key is empty"
When run add_extra "scalar" "=value" extra_keys extra_values extra_kinds
The status should be failure
The stderr should include "empty key"
End

It "warns and overwrites when the same key is added twice"
add_extra "scalar" "key=first" extra_keys extra_values extra_kinds
add_extra_again() {
  add_extra "scalar" "key=second" extra_keys extra_values extra_kinds
  # Emit observable state on stdout for the assertion to inspect.
  echo "value=${extra_values[key]}"
  echo "count=${#extra_keys[@]}"
}
When call add_extra_again
The stderr should include "duplicate"
The output should include "value=second"
The output should include "count=1"
End
End

Describe "apply_override"
apply_override_setup() {
  unset overrides
  declare -gA overrides=()
}

BeforeEach "apply_override_setup"

It "returns the resolved value when an override is not registered"
When call apply_override "branch" "main" overrides
The output should equal "main"
End

It "returns the override when one is registered"
overrides[branch]="custom-branch"
When call apply_override "branch" "main" overrides
The output should equal "custom-branch"
End

It "force-omits when the override value is empty"
overrides[run_id]=""
When call apply_override "run_id" "20260516Z" overrides
The output should equal ""
End
End

Describe "add_override"
add_override_setup() {
  unset overrides
  declare -gA overrides=()
}

BeforeEach "add_override_setup"

It "records the override when the argument is well-formed"
add_override "branch=custom" overrides
When call echo "${overrides[branch]}"
The output should equal "custom"
End

It "records an empty value (force-omit) when the argument is KEY="
add_override "run_id=" overrides
When call test "${overrides[run_id]+set}" = "set"
The status should be success
End

It "fails when the argument does not contain an equals sign"
When run add_override "bad_arg" overrides
The status should be failure
The stderr should include "missing '='"
End

It "fails when the key is empty"
When run add_override "=value" overrides
The status should be failure
The stderr should include "empty key"
End
End
