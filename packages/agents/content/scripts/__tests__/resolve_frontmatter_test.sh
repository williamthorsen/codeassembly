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
  pushd "$tmpdir" >/dev/null
}

cleanup_tmpdir() {
  popd >/dev/null
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
echo "/some/path/20260516-143946Z" > .claude/tmp/active-run-dir
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
