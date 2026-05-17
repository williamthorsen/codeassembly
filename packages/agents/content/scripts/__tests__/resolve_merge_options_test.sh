#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/resolve-merge-options.sh"

Describe "strip_bang"
It "strips a single trailing bang"
When call strip_bang "feat!"
The output should equal "feat"
End

It "leaves a value without a trailing bang unchanged"
When call strip_bang "feat"
The output should equal "feat"
End

It "leaves an embedded bang unchanged"
When call strip_bang "wo!w"
The output should equal "wo!w"
End

It "returns empty for empty input"
When call strip_bang ""
The output should equal ""
End
End

Describe "json_escape"
It "escapes backslashes"
When call json_escape 'a\b'
The output should equal 'a\\b'
End

It "escapes double quotes"
When call json_escape 'a"b'
The output should equal 'a\"b'
End

It "passes through plain strings"
When call json_escape "feat"
The output should equal "feat"
End
End

Describe "strict_majority"
It "returns empty for empty input"
test_majority() {
  : | strict_majority
}
When call test_majority
The output should equal ""
End

It "returns the only value when there is one entry"
test_majority() {
  printf '1\tfeat\n' | strict_majority
}
When call test_majority
The output should equal "feat"
End

It "returns the dominant value with a strict majority of two-to-one"
test_majority() {
  printf '2\tfeat\n1\tfix\n' | strict_majority
}
When call test_majority
The output should equal "feat"
End

It "returns empty when values are tied at one each"
test_majority() {
  printf '1\tfeat\n1\tfix\n' | strict_majority
}
When call test_majority
The output should equal ""
End

It "returns empty when values are tied at two each"
test_majority() {
  printf '2\tfeat\n2\tfix\n' | strict_majority
}
When call test_majority
The output should equal ""
End

It "returns empty when no value strictly dominates a three-way split"
test_majority() {
  printf '2\tfeat\n1\tfix\n1\tdocs\n' | strict_majority
}
When call test_majority
The output should equal ""
End

It "returns the dominant value when it strictly exceeds half across three values"
test_majority() {
  printf '3\tfeat\n1\tfix\n1\tdocs\n' | strict_majority
}
When call test_majority
The output should equal "feat"
End
End

Describe "collect_label_candidates"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
  pr_labels=()
  label_map="$tmpdir/label-map.json"
}

cleanup_tmpdir() {
  rm -rf "$tmpdir"
}

write_label_map() {
  cat >"$label_map" <<'JSON'
{
  "types": {
    "feat": "feature",
    "fix": "fix",
    "docs": "documentation"
  },
  "scopes": {
    "agents": "scope:agents",
    "factory": "scope:factory"
  }
}
JSON
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns empty when the label-map file is missing"
test_collect() {
  pr_labels=("feature")
  collect_label_candidates "types"
}
When call test_collect
The output should equal ""
End

It "returns empty when no PR labels are provided"
test_collect() {
  write_label_map
  collect_label_candidates "types"
}
When call test_collect
The output should equal ""
End

It "returns the type when exactly one label matches"
test_collect() {
  write_label_map
  pr_labels=("feature" "scope:agents" "breaking")
  collect_label_candidates "types"
}
When call test_collect
The output should equal "feat"
End

It "returns multiple types when multiple labels match"
test_collect() {
  write_label_map
  pr_labels=("feature" "fix")
  collect_label_candidates "types"
}
When call test_collect
The output should include "feat"
The output should include "fix"
End

It "returns the scope when exactly one scope label matches"
test_collect() {
  write_label_map
  pr_labels=("scope:agents" "feature")
  collect_label_candidates "scopes"
}
When call test_collect
The output should equal "agents"
End

It "returns empty when no labels match the section"
test_collect() {
  write_label_map
  pr_labels=("nonexistent" "another")
  collect_label_candidates "types"
}
When call test_collect
The output should equal ""
End

It "deduplicates when the same label appears twice"
test_collect() {
  write_label_map
  pr_labels=("feature" "feature")
  collect_label_candidates "types"
}
When call test_collect
The output should equal "feat"
End
End

Describe "collect_commit_tally"
setup_repo() {
  tmpdir=$(mktemp -d)
  original_pwd="$PWD"
  cd "$tmpdir" || exit
  git init -q -b main
  git config user.email "t@t"
  git config user.name "t"
  git commit --allow-empty -q -m "Initial"
  git checkout -q -b branch
  base_ref="main"
  ticket_ref=""
}

cleanup_repo() {
  cd "$original_pwd" || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_repo"
AfterEach "cleanup_repo"

It "tallies a single type across one commit"
test_tally() {
  git commit --allow-empty -q -m "agents|feat: Add foo"
  collect_commit_tally "type"
}
When call test_tally
The output should equal "$(printf '1\tfeat')"
End

It "tallies multiple commits with the same type"
test_tally() {
  git commit --allow-empty -q -m "agents|feat: First"
  git commit --allow-empty -q -m "agents|feat: Second"
  collect_commit_tally "type"
}
When call test_tally
The output should equal "$(printf '2\tfeat')"
End

It "tallies mixed types in count-descending order"
test_tally() {
  git commit --allow-empty -q -m "agents|feat: First"
  git commit --allow-empty -q -m "agents|feat: Second"
  git commit --allow-empty -q -m "agents|fix: Third"
  collect_commit_tally "type"
}
When call test_tally
The output should equal "$(printf '2\tfeat\n1\tfix')"
End

It "strips a trailing bang from type values during tally"
test_tally() {
  git commit --allow-empty -q -m "agents|feat!: Breaking change"
  git commit --allow-empty -q -m "agents|feat: Regular change"
  collect_commit_tally "type"
}
When call test_tally
The output should equal "$(printf '2\tfeat')"
End

It "tallies scopes for the scope dimension"
test_tally() {
  git commit --allow-empty -q -m "agents|feat: First"
  git commit --allow-empty -q -m "factory|feat: Second"
  git commit --allow-empty -q -m "agents|fix: Third"
  collect_commit_tally "scope"
}
When call test_tally
The output should equal "$(printf '2\tagents\n1\tfactory')"
End

It "does not strip bangs from scope values"
test_tally() {
  git commit --allow-empty -q -m "agents!|feat: An odd subject"
  collect_commit_tally "scope"
}
When call test_tally
The output should equal "$(printf '1\tagents!')"
End

It "skips subjects without a scope-pipe-type prefix"
test_tally() {
  git commit --allow-empty -q -m "agents|feat: Has prefix"
  git commit --allow-empty -q -m "Just a plain title"
  git commit --allow-empty -q -m "feat: only type without scope"
  collect_commit_tally "type"
}
When call test_tally
The output should equal "$(printf '1\tfeat')"
End

It "strips a leading ticket-ref token before parsing the prefix"
test_tally() {
  ticket_ref="#494"
  git commit --allow-empty -q -m "#494 agents|feat: With ticket ref"
  git commit --allow-empty -q -m "#494 agents|feat: Another with ref"
  collect_commit_tally "type"
}
When call test_tally
The output should equal "$(printf '2\tfeat')"
End

It "returns empty when there are no commits in the range"
test_tally() {
  collect_commit_tally "type"
}
When call test_tally
The output should equal ""
End
End

Describe "resolve_dimension"
setup_repo() {
  tmpdir=$(mktemp -d)
  original_pwd="$PWD"
  cd "$tmpdir" || exit
  git init -q -b main
  git config user.email "t@t"
  git config user.name "t"
  git commit --allow-empty -q -m "Initial"
  git checkout -q -b branch
  base_ref="main"
  ticket_ref=""
  pr_labels=()
  label_map="$tmpdir/label-map.json"
  cat >"$label_map" <<'JSON'
{
  "types": {"feat": "feature", "fix": "fix"},
  "scopes": {"agents": "scope:agents", "factory": "scope:factory"}
}
JSON
}

cleanup_repo() {
  cd "$original_pwd"
  rm -rf "$tmpdir"
}

BeforeEach "setup_repo"
AfterEach "cleanup_repo"

It "uses the CLI override when provided, even if labels and commits disagree"
test_resolve() {
  pr_labels=("fix")
  git commit --allow-empty -q -m "agents|fix: Something"
  resolve_dimension "type" "feat"
}
When call test_resolve
The output should equal '"type":{"status":"resolved","value":"feat"}'
End

It "strips a trailing bang from a CLI type override"
test_resolve() {
  resolve_dimension "type" "feat!"
}
When call test_resolve
The output should equal '"type":{"status":"resolved","value":"feat"}'
End

It "resolves via labels when exactly one label matches"
test_resolve() {
  pr_labels=("feature" "scope:agents")
  resolve_dimension "type" ""
}
When call test_resolve
The output should equal '"type":{"status":"resolved","value":"feat"}'
End

It "falls through to commit-majority when labels are ambiguous"
test_resolve() {
  pr_labels=("feature" "fix")
  git commit --allow-empty -q -m "agents|feat: First"
  git commit --allow-empty -q -m "agents|feat: Second"
  git commit --allow-empty -q -m "agents|fix: Third"
  resolve_dimension "type" ""
}
When call test_resolve
The output should equal '"type":{"status":"resolved","value":"feat"}'
End

It "falls through to commit-majority when no labels match"
test_resolve() {
  git commit --allow-empty -q -m "agents|feat: First"
  resolve_dimension "type" ""
}
When call test_resolve
The output should equal '"type":{"status":"resolved","value":"feat"}'
End

It "returns ambiguous with the union of label and commit candidates when nothing dominates"
test_resolve() {
  pr_labels=("feature" "fix")
  git commit --allow-empty -q -m "agents|feat: One"
  git commit --allow-empty -q -m "agents|fix: Two"
  resolve_dimension "type" ""
}
When call test_resolve
The output should equal '"type":{"status":"ambiguous","candidates":["feat","fix"]}'
End

It "returns ambiguous with empty candidates when nothing resolves at all"
test_resolve() {
  resolve_dimension "type" ""
}
When call test_resolve
The output should equal '"type":{"status":"ambiguous","candidates":[]}'
End

It "resolves the scope dimension via labels"
test_resolve() {
  pr_labels=("scope:agents" "feature")
  resolve_dimension "scope" ""
}
When call test_resolve
The output should equal '"scope":{"status":"resolved","value":"agents"}'
End
End

Describe "end-to-end JSON output"
setup_repo() {
  tmpdir=$(mktemp -d)
  original_pwd="$PWD"
  cd "$tmpdir" || exit
  git init -q -b main
  git config user.email "t@t"
  git config user.name "t"
  git commit --allow-empty -q -m "Initial"
  git checkout -q -b branch
  cat >"$tmpdir/label-map.json" <<'JSON'
{
  "types": {"feat": "feature", "fix": "fix"},
  "scopes": {"agents": "scope:agents", "factory": "scope:factory"}
}
JSON
}

cleanup_repo() {
  cd "$original_pwd" || exit
  rm -rf "$tmpdir"
}

BeforeEach "setup_repo"
AfterEach "cleanup_repo"

script="$PROJECT_ROOT/content/scripts/resolve-merge-options.sh"

It "errors out when --base-ref is missing"
When run bash "$script"
The status should equal 1
The stderr should include "resolve-merge-options.sh: Missing required flag: --base-ref"
End

It "errors out when --base-ref does not exist in the repo"
When run bash "$script" --base-ref "nonexistent"
The status should equal 1
The stderr should include "resolve-merge-options.sh: Base ref not found"
End

It "errors out with status 1 on an unknown option"
When run bash "$script" --base-ref "main" --bogus
The status should equal 1
The stderr should include "resolve-merge-options.sh: Unknown option: --bogus"
End

It "errors out with status 1 when --label-map is malformed JSON"
run_malformed() {
  printf 'not-json' >"$tmpdir/bad-map.json"
  bash "$script" \
    --pr-label "feature" \
    --base-ref "main" \
    --label-map "$tmpdir/bad-map.json"
}
When run run_malformed
The status should equal 1
The stderr should include "resolve-merge-options.sh: Cannot read label-map"
End

It "exits 0 and prints usage when --help is passed"
When run bash "$script" --help
The status should equal 0
The stderr should include "Usage:"
The stderr should include "--base-ref REF"
End

It "strips trailing bang from --cli-type end-to-end"
When run bash "$script" --cli-scope "agents" --cli-type "feat!" --base-ref "main"
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
The status should be success
End

It "resolves both dimensions from CLI overrides"
When run bash "$script" --cli-scope "agents" --cli-type "feat" --base-ref "main"
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
The status should be success
End

It "resolves both dimensions from PR labels"
run_resolve() {
  bash "$script" \
    --pr-label "feature" --pr-label "scope:agents" \
    --base-ref "main" \
    --label-map "$tmpdir/label-map.json"
}
When call run_resolve
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
End

It "resolves both dimensions from commit majority"
run_resolve() {
  git commit --allow-empty -q -m "agents|feat: One"
  git commit --allow-empty -q -m "agents|feat: Two"
  bash "$script" \
    --base-ref "main" \
    --label-map "$tmpdir/label-map.json"
}
When call run_resolve
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
End

It "marks both dimensions ambiguous when nothing resolves"
run_resolve() {
  git commit --allow-empty -q -m "agents|feat: One"
  git commit --allow-empty -q -m "factory|fix: Two"
  bash "$script" \
    --base-ref "main" \
    --label-map "$tmpdir/label-map.json"
}
When call run_resolve
The output should equal '{"scope":{"status":"ambiguous","candidates":["agents","factory"]},"type":{"status":"ambiguous","candidates":["feat","fix"]}}'
End

It "honors --ticket-ref when stripping commit subjects"
run_resolve() {
  git commit --allow-empty -q -m "#494 agents|feat: First"
  git commit --allow-empty -q -m "#494 agents|feat: Second"
  bash "$script" \
    --base-ref "main" \
    --ticket-ref "#494" \
    --label-map "$tmpdir/label-map.json"
}
When call run_resolve
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
End

It "treats CLI override as winning over labels and commits"
run_resolve() {
  git commit --allow-empty -q -m "agents|fix: One"
  git commit --allow-empty -q -m "agents|fix: Two"
  bash "$script" \
    --cli-type "feat" \
    --pr-label "fix" \
    --base-ref "main" \
    --label-map "$tmpdir/label-map.json"
}
When call run_resolve
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
End

It "skips label reverse-lookup gracefully when label-map is absent"
run_resolve() {
  git commit --allow-empty -q -m "agents|feat: Single"
  bash "$script" \
    --pr-label "feature" \
    --base-ref "main" \
    --label-map "$tmpdir/nonexistent-map.json"
}
When call run_resolve
The output should equal '{"scope":{"status":"resolved","value":"agents"},"type":{"status":"resolved","value":"feat"}}'
End
End
