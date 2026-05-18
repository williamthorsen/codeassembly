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
End

Describe "emit_json"
It "always emits branch, commit, platform, and timestamp"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should include '"branch": "main"'
The output should include '"commit": "abc1234"'
The output should include '"platform": "github"'
The output should include '"timestamp": "2026-05-16T00:00:00Z"'
End

It "omits baseSha when empty"
When call emit_json "main" "abc1234" "" "" "" "" "github" "2026-05-16T00:00:00Z" ""
The output should not include "baseSha"
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
  "platform": "github",
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

Describe "warn_pr_failure"
It "emits the canonical warning on stderr"
When call warn_pr_failure "test reason"
The stderr should include "Note: PR lookup failed; proceeding without pr field."
End

It "appends a diagnostic line on stderr"
When call warn_pr_failure "test reason"
The stderr should include "(test reason)"
End

It "produces no stdout"
When call warn_pr_failure "test reason"
The output should equal ""
The stderr should be present
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

Describe "resolve_pr_url"
It "produces a canonical warning on stderr for unknown platforms"
When call resolve_pr_url "nope" "main"
The stderr should include "Note: PR lookup failed; proceeding without pr field."
The stderr should include "(unknown platform: nope)"
The output should equal ""
End
End

Describe "run_with_timeout"
It "returns the wrapped command's stdout when it completes inside the timeout"
When call run_with_timeout 5 echo "hello"
The output should equal "hello"
The status should be success
End

It "exits non-zero when the wrapped command exceeds the timeout"
# `sleep 2` against a 1-second budget; bounded test runtime ~1s. The exact exit code varies by backend (124 from GNU
# `timeout`, 142 from a Perl SIGALRM), so the assertion deliberately covers only the non-zero contract.
When run run_with_timeout 1 sleep 2
The status should be failure
End

It "uses the Perl alarm fallback when neither timeout nor gtimeout is on PATH"
perl_fallback_run() {
  local bin_dir
  bin_dir=$(mktemp -d)
  # Symlink only perl and sleep into the restricted PATH;
  # intentionally omits timeout and gtimeout to exercise the Perl branch.
  ln -s "$(command -v perl)" "$bin_dir/perl"
  ln -s "$(command -v sleep)" "$bin_dir/sleep"
  PATH="$bin_dir" run_with_timeout 1 sleep 2
}
When run perl_fallback_run
The status should be failure
End

It "fails loudly when no timeout backend is on PATH"
no_backend_run() {
  local empty_dir
  empty_dir=$(mktemp -d)
  PATH="$empty_dir" run_with_timeout 1 true
}
When run no_backend_run
The status should equal 1
The stderr should include "no timeout mechanism available"
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

It "wraps the output in --- delimiters"
When call emit_yaml \
  "create-devlog" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The line 1 of output should equal "---"
The output should end with "---"
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
  # Stub `gh` to return empty (no PR), so the test is hermetic.
  mkdir -p bin
  cat >bin/gh <<'SH'
#!/usr/bin/env bash
exit 0
SH
  chmod +x bin/gh
  ORIGINAL_PATH="$PATH"
  PATH="$tmpdir/bin:$PATH"
}

cleanup_main_e2e() {
  PATH="$ORIGINAL_PATH"
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
End
