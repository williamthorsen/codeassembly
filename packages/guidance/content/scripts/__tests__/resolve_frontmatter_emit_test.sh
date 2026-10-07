#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/resolve-frontmatter.sh"

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

Describe "needs_yaml_quoting"
It "returns true for empty values"
When call needs_yaml_quoting ""
The status should be success
End

It "returns false for plain alphanumerics"
When call needs_yaml_quoting "foo123"
The status should be failure
End

It "returns true for values in which a colon is followed by whitespace"
When call needs_yaml_quoting "key: value"
The status should be success
End

It "returns false for values in which a colon is followed by a non-space character"
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

Describe "emit_yaml"
emit_yaml_setup() {
  unset yaml_keys yaml_values yaml_kinds
  declare -ga yaml_keys=()
  declare -gA yaml_values=()
  declare -gA yaml_kinds=()
}

BeforeEach "emit_yaml_setup"

It "wraps the frontmatter in --- delimiters and emits nothing after the closing one"
When call emit_yaml \
  "create-devlog" "2026-05-16T00:00:00Z" "deadbee" "true" "" \
  "" "" "main" "abc1234" "" "" \
  yaml_keys yaml_values yaml_kinds
The line 1 of output should equal "---"
The output should end with "---"
The output should not include "<!--"
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
