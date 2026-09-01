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
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
}

cleanup_repo() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

setup_no_repo() {
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
}

cleanup_no_repo() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

Context "inside a git repository"
BeforeEach "setup_repo"
AfterEach "cleanup_repo"

It "returns the repo-root-anchored absolute path for a simple branch"
# Resolve symlinks so the comparison matches `git rev-parse --show-toplevel`, which always reports the canonical path
# (e.g. on macOS `/tmp` -> `/private/tmp`).
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
BeforeEach "setup_no_repo"
AfterEach "cleanup_no_repo"

It "returns non-zero with empty stdout outside a git repository"
When call resolve_manifest_path "main"
The output should equal ""
The status should be failure
End
End
End

Describe "emit_json"
It "always emits branch, commit, scm, and timestamp"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should include '"branch": "main"'
The output should include '"commit": "abc1234"'
The output should include '"scm": "github"'
The output should include '"timestamp": "2026-05-16T00:00:00Z"'
End

It "omits baseSha when empty"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should not include "baseSha"
End

It "omits the seal marker, which belongs to yaml mode"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should not include "Sealed record"
End

It "emits baseSha when present"
When call emit_json "main" "abc1234" "deadbee" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should include '"baseSha": "deadbee"'
End

It "omits pr when empty"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should not include '"pr"'
End

It "emits pr when present"
When call emit_json "main" "abc1234" "" "https://github.com/x/y/pull/1" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should include '"pr": "https://github.com/x/y/pull/1"'
End

It "omits ticket_id and ticket_ref when empty"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should not include "ticket_id"
The output should not include "ticket_ref"
End

It "emits ticket_id and ticket_ref when present"
When call emit_json "main" "abc1234" "" "" "537" "#537" "github" "2026-05-16T00:00:00Z" ""
The output should include '"ticket_id": "537"'
The output should include '"ticket_ref": "#537"'
End

It "omits run_id when empty"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should not include "run_id"
End

It "emits run_id when present"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" "20260516-143946Z"
The output should include '"run_id": "20260516-143946Z"'
End

It "emits a fully-populated argument set in canonical key order"
expected_json() {
  cat <<'JSON'
{
  "branch": "main",
  "commit": "abc1234",
  "scm": "github",
  "timestamp": "2026-05-16T00:00:00Z",
  "baseSha": "deadbee",
  "pr": "https://github.com/x/y/pull/1",
  "ticket_id": "537",
  "ticket_ref": "#537",
  "run_id": "20260516-143946Z"
}
JSON
}
When call emit_json "main" "abc1234" "deadbee" "https://github.com/x/y/pull/1" "537" "#537" "github" "2026-05-16T00:00:00Z" "20260516-143946Z"
The output should equal "$(expected_json)"
End
End

Describe "resolve_run_id"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
}

cleanup_tmpdir() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns empty when no breadcrumb exists"
When call resolve_run_id
The output should equal ""
End

It "returns the run-dir basename when the breadcrumb exists"
mkdir -p .claude/tmp
echo "/some/path/20260516-143946Z" >.claude/tmp/active-run-dir
When call resolve_run_id
The output should equal "20260516-143946Z"
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

Describe "needs_yaml_quoting"
It "returns true for empty values"
When call needs_yaml_quoting ""
The status should be success
End

It "returns false for plain alphanumerics"
When call needs_yaml_quoting "foo123"
The status should be failure
End

It "returns true for values where a colon is followed by whitespace"
When call needs_yaml_quoting "key: value"
The status should be success
End

It "returns false for values where a colon is followed by a non-space character"
When call needs_yaml_quoting "key:value"
The status should be failure
End

It "returns true for values ending in a trailing colon"
When call needs_yaml_quoting "trailing:"
The status should be success
End

It "returns true for values containing pound sign"
When call needs_yaml_quoting "#537"
The status should be success
End

It "returns true for values with leading whitespace"
When call needs_yaml_quoting " leading"
The status should be success
End

It "returns true for values with trailing whitespace"
When call needs_yaml_quoting "trailing "
The status should be success
End

It "returns true for values beginning with a hyphen"
When call needs_yaml_quoting "-leading"
The status should be success
End

It "returns true for values beginning with a question mark"
When call needs_yaml_quoting "?leading"
The status should be success
End

It "returns true for values beginning with a colon"
When call needs_yaml_quoting ":leading"
The status should be success
End

It "returns true for a value of exactly a colon"
When call needs_yaml_quoting ":"
The status should be success
End

It "returns false for URLs (no special chars under predicate)"
When call needs_yaml_quoting "https://github.com/x/y/pull/1"
The status should be failure
End

It "returns true for values containing brackets"
When call needs_yaml_quoting "a[b]c"
The status should be success
End

It "returns true for values containing braces"
When call needs_yaml_quoting "{key}"
The status should be success
End

It "returns true for values containing commas"
When call needs_yaml_quoting "a,b"
The status should be success
End

It "returns true for values containing pipe"
When call needs_yaml_quoting "a|b"
The status should be success
End

It "returns true for values containing backtick"
When call needs_yaml_quoting "a\`b"
The status should be success
End

It "returns true for values containing an asterisk"
When call needs_yaml_quoting "a*b"
The status should be success
End

It "returns true for values containing an ampersand"
When call needs_yaml_quoting "a&b"
The status should be success
End

It "returns true for values containing an exclamation mark"
When call needs_yaml_quoting "a!b"
The status should be success
End

It "returns true for values containing a greater-than sign"
When call needs_yaml_quoting "a>b"
The status should be success
End

It "returns true for values containing a less-than sign"
When call needs_yaml_quoting "a<b"
The status should be success
End

It "returns true for values containing a percent sign"
When call needs_yaml_quoting "a%b"
The status should be success
End

It "returns true for values containing an at sign"
When call needs_yaml_quoting "a@b"
The status should be success
End

It "returns true for values containing a double quote"
When call needs_yaml_quoting 'a"b'
The status should be success
End
End

Describe "yaml_quote"
It "leaves bare values unquoted"
When call yaml_quote "foo123"
The output should equal "foo123"
End

It "wraps unsafe values in single quotes"
When call yaml_quote "#537"
The output should equal "'#537'"
End

It "doubles embedded single quotes inside the wrapper"
When call yaml_quote "it's"
The output should equal "'it''s'"
End

It "quotes empty values as empty string"
When call yaml_quote ""
The output should equal "''"
End

It "leaves URLs unquoted"
When call yaml_quote "https://github.com/x/y/pull/1"
The output should equal "https://github.com/x/y/pull/1"
End
End

Describe "emit_yaml_flow_list"
It "emits an empty flow list for empty values"
When call emit_yaml_flow_list "items" ""
The output should equal "items: []"
End

It "emits single-element flow lists in bracket form"
When call emit_yaml_flow_list "commits" "a1b2c3d"
The output should equal "commits: [a1b2c3d]"
End

It "splits comma-separated values into list elements"
When call emit_yaml_flow_list "commits" "a1b2c3d,e4f5g6h"
The output should equal "commits: [a1b2c3d, e4f5g6h]"
End

It "auto-quotes elements that contain unsafe glyphs"
When call emit_yaml_flow_list "refs" "main,#537"
The output should equal "refs: [main, '#537']"
End

It "doubles embedded single quotes in list elements"
When call emit_yaml_flow_list "refs" "it's,safe"
The output should equal "refs: ['it''s', safe]"
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

It "fails when the argument has no equals sign"
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

It "returns the resolved value when no override is registered"
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

Describe "emit_yaml"
emit_yaml_setup() {
  unset yaml_keys yaml_values yaml_kinds
  declare -ga yaml_keys=()
  declare -gA yaml_values=()
  declare -gA yaml_kinds=()
}

BeforeEach "emit_yaml_setup"

It "wraps the frontmatter in --- delimiters and seals it"
When call emit_yaml \
  "create-devlog" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The line 1 of output should equal "---"
The output should include "$(printf -- '---\n%s' "$SEAL_MARKER")"
The output should end with "$SEAL_MARKER"
End

It "emits provenance block in canonical order"
When call emit_yaml \
  "create-devlog" "2026-05-16T00:00:00Z" "deadbee" "true" "claude-opus" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should include "provenance:"
The output should include "skill: create-devlog"
The output should include "timestamp: 2026-05-16T00:00:00Z"
The output should include "baseSha: deadbee"
The output should include "isInteractive: true"
The output should include "model: claude-opus"
End

It "omits provenance.baseSha when empty"
When call emit_yaml \
  "skill-x" "2026-05-16T00:00:00Z" "" "false" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should not include "baseSha"
End

It "omits provenance.model when empty"
When call emit_yaml \
  "skill-x" "2026-05-16T00:00:00Z" "deadbee" "false" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should not include "model"
End

It "emits isInteractive as a bare boolean"
When call emit_yaml \
  "skill-x" "2026-05-16T00:00:00Z" "deadbee" "false" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should include "isInteractive: false"
The output should not include "isInteractive: 'false'"
End

It "emits canonical top-level fields after provenance"
When call emit_yaml \
  "skill-x" "2026-05-16T00:00:00Z" "deadbee" "false" "" \
  "537" "#537" "main" "abc1234" "https://github.com/x/y/pull/1" "20260516-143946Z" \
  yaml_keys yaml_values yaml_kinds
The output should include "ticket_id: 537"
The output should include "ticket_ref: '#537'"
The output should include "branch: main"
The output should include "commit: abc1234"
The output should include "pr: https://github.com/x/y/pull/1"
The output should include "run_id: 20260516-143946Z"
End

It "emits canonical top-level fields in fixed order"
When call emit_yaml \
  "skill-x" "2026-05-16T00:00:00Z" "deadbee" "false" "" \
  "537" "#537" "main" "abc1234" "https://github.com/x/y/pull/1" "20260516-143946Z" \
  yaml_keys yaml_values yaml_kinds
The output should match pattern "*ticket_id*ticket_ref*branch*commit*pr*run_id*"
End

It "omits empty top-level fields"
When call emit_yaml \
  "skill-x" "2026-05-16T00:00:00Z" "deadbee" "false" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should not include "ticket_id"
The output should not include "ticket_ref"
The output should not include "pr:"
The output should not include "run_id"
End

It "emits scalar extensions after canonical fields"
yaml_keys+=("title")
yaml_values[title]="My change"
yaml_kinds[title]="scalar"
When call emit_yaml \
  "summarize-change" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should include "title: My change"
End

It "emits flow-list extensions after canonical fields"
yaml_keys+=("commits")
yaml_values[commits]="a1b2c3d,e4f5g6h"
yaml_kinds[commits]="list"
When call emit_yaml \
  "create-devlog" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should include "commits: [a1b2c3d, e4f5g6h]"
End

emit_three_ordered() {
  emit_yaml \
    "summarize-change" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
    "" "" "main" "abc1234" "" "" \
    yaml_keys yaml_values yaml_kinds
}

It "preserves insertion order across mixed scalar and list extensions"
yaml_keys+=("scope")
yaml_values[scope]="agents"
yaml_kinds[scope]="scalar"
yaml_keys+=("commits")
yaml_values[commits]="a1b2c3d"
yaml_kinds[commits]="list"
yaml_keys+=("type")
yaml_values[type]="feat"
yaml_kinds[type]="scalar"
When call emit_three_ordered
The output should include "scope: agents"
The output should include "commits: "
The output should include "type: feat"
# Ensure scope < commits < type ordering. Glob brackets need escaping;
# match the contiguous block including newlines via a structural pattern.
The output should match pattern "*scope: agents*commits:*type: feat*"
End

It "auto-quotes values containing colons"
yaml_keys+=("title")
yaml_values[title]="Add: feature"
yaml_kinds[title]="scalar"
When call emit_yaml \
  "summarize-change" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should include "title: 'Add: feature'"
End

It "omits scalar extensions whose value is empty"
yaml_keys+=("empty_field")
yaml_values[empty_field]=""
yaml_kinds[empty_field]="scalar"
When call emit_yaml \
  "summarize-change" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The output should not include "empty_field"
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

It "fails when the argument has no equals sign"
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

Describe "main"
setup_main_validation() {
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
}

cleanup_main_validation() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_main_validation"
AfterEach "cleanup_main_validation"

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
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
}

cleanup_unreadable_repo() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_unreadable_repo"
AfterEach "cleanup_unreadable_repo"

It "names the unreadable repository rather than an unresolvable branch"
# `GIT_DIR` points nowhere while the working directory is a healthy repository, which is the shape a
# sandboxed nested `git` produces: the repository is present and git refuses to read it.
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
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
  # No commit: `git rev-parse --git-dir` answers while `--abbrev-ref HEAD` fails, which is the only
  # condition that reaches the branch diagnostic past the readability probe.
  git init --quiet --initial-branch=main .
}

cleanup_unborn_head() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_unborn_head"
AfterEach "cleanup_unborn_head"

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
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
  # Deliberately do NOT create .agents/main.branch-manifest.json; the deriver should write one.
  # Point the bundle resolver at the on-disk bundle. shellspec sources this script via `Include`,
  # so the script's own `BASH_SOURCE[0]`-based path computation resolves to the shellspec runner
  # rather than the agents content tree.
  export RESOLVE_FRONTMATTER_BUNDLE_PATH="$PROJECT_ROOT/content/skills/derive-session-context/derive-session-context.mjs"
  # Pass --home pointing at the tmpdir so the deriver does not read the developer's real
  # `~/.agents/preferences.yaml` (whose schema-validity is environment-specific). Using a flag
  # instead of HOME env override avoids breaking PATH-resolution tools (e.g., asdf shims).
  export RESOLVE_FRONTMATTER_BUNDLE_ARGS="--home $tmpdir"
}

cleanup_missing_manifest() {
  unset RESOLVE_FRONTMATTER_BUNDLE_PATH RESOLVE_FRONTMATTER_BUNDLE_ARGS
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_missing_manifest"
AfterEach "cleanup_missing_manifest"

It "derives and writes the manifest on cache miss, then succeeds"
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
When run main --skill foo --interactive true --override "run_id="
The status should be success
The output should include "skill: foo"
The output should include "branch: main"
# After the deriver runs, the manifest file should exist at the canonical path.
The path "$resolved_tmpdir/.agents/main.branch-manifest.json" should be exist
End

It "derives the manifest at the repo root when invoked from a nested subdirectory"
# Regression: `derive_manifest` previously omitted `--cwd`, so the deriver wrote to
# the caller's working directory while `read_manifest` looked at the repo root. Every
# call from a subdirectory re-ran the deriver and left manifests in nested `.agents/`
# folders. The fix anchors the deriver at `git rev-parse --show-toplevel`.
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
mkdir -p packages/nested/deep
subdir_run() {
  pushd packages/nested/deep >/dev/null
  main --skill foo --interactive true --override "run_id="
  local rc=$?
  popd >/dev/null
  return $rc
}
When run subdir_run
The status should be success
The output should include "skill: foo"
The output should include "branch: main"
# Manifest must appear at the repo root, not the subdirectory.
The path "$resolved_tmpdir/.agents/main.branch-manifest.json" should be exist
The path "$resolved_tmpdir/packages/nested/deep/.agents/main.branch-manifest.json" should not be exist
End

It "recovers when the cached manifest contains corrupt JSON"
# Seed a corrupt `.branch-manifest.json`; `read_manifest`'s `jq empty` guard treats it
# as a cache miss and falls through to `derive_manifest`, which recomposes the manifest
# from preferences + git state. Mirrors the TS-side `tryReadManifest` recovery contract.
resolved_tmpdir=$(cd "$tmpdir" && pwd -P)
mkdir -p .agents
printf '{ "ticket_id": "broken' >.agents/main.branch-manifest.json
When run main --skill foo --interactive true --override "run_id="
The status should be success
The output should include "skill: foo"
The output should include "branch: main"
# The deriver emits a stderr diagnostic when it overwrites the corrupt file so an operator can
# distinguish a normal cache miss from recurring corruption. Assert that it appears.
The stderr should include "manifest"
The stderr should include "is corrupt"
# After recovery, the manifest should now be valid JSON readable by jq.
The path "$resolved_tmpdir/.agents/main.branch-manifest.json" should be exist
End
End

Describe "main end-to-end"
setup_main_e2e() {
  tmpdir=$(mktemp -d)
  pushd "$tmpdir" >/dev/null || exit
  # Initialize a minimal git repository so `current_branch` and `git rev-parse --short HEAD` succeed.
  git init --quiet --initial-branch=main .
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty --quiet -m "initial"
  # Write the branch manifest the script reads for session-level fields.
  mkdir -p .agents
  cat >.agents/main.branch-manifest.json <<'JSON'
{
  "platform": "github",
  "ticket_id": "537",
  "ticket_ref": "#537",
  "default_branch": "HEAD"
}
JSON
}

cleanup_main_e2e() {
  popd >/dev/null || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_main_e2e"
AfterEach "cleanup_main_e2e"

It "emits extension fields end-to-end and force-omits run_id via --override KEY="
When run main \
  --skill foo \
  --interactive true \
  --extra "alpha=1" \
  --extra-list "tags=a,b" \
  --override "run_id="
The status should be success
The output should include "skill: foo"
The output should include "isInteractive: true"
The output should include "alpha: 1"
The output should include "tags: [a, b]"
The output should not include "run_id"
End

It "emits pr only when supplied via --override pr="
When run main \
  --skill foo \
  --interactive true \
  --override "run_id=" \
  --override "pr=https://github.com/o/r/pull/7"
The status should be success
The output should include "pr: https://github.com/o/r/pull/7"
End

It "omits pr when no --override pr is given"
When run main --skill foo --interactive true --override "run_id="
The status should be success
The output should not include "pr:"
End

It "resolves the manifest when invoked from a nested subdirectory"
mkdir -p packages/nested/deep
pushd packages/nested/deep >/dev/null
result=$(main --skill foo --interactive true --override "run_id=" 2>&1)
status=$?
popd >/dev/null
When call test "$status" -eq 0
The status should be success
The variable result should include "skill: foo"
The variable result should include "ticket_id: 537"
End

It "resolves a legacy manifest 'platform' key to 'scm' in json output"
# The fixture manifest has the legacy 'platform' key; the script's '.scm // .platform'
# fallback should still emit it under the new 'scm' key.
When run main --format json
The status should be success
The output should include '"scm": "github"'
End
End
