#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/get-ticket-id.sh"

Describe "extract_jira_id"
It "extracts a bare Jira-style ID"
When call extract_jira_id "COMPPLAN-795"
The output should equal "COMPPLAN-795"
End

It "extracts a Jira-style ID from an author-prefixed branch"
When call extract_jira_id "wt/COMPPLAN-795"
The output should equal "COMPPLAN-795"
End

It "extracts a Jira-style ID from a multi-character author prefix"
When call extract_jira_id "wthorsen/MAC-130"
The output should equal "MAC-130"
End

It "extracts a Jira-style ID followed by a description slug"
When call extract_jira_id "wt/JIRA-123-and-some-message"
The output should equal "JIRA-123"
End

It "stops at a description slug starting from position zero"
When call extract_jira_id "MAC-147-some-description"
The output should equal "MAC-147"
End

It "extracts a Jira-style ID embedded inside a slug with multiple separators"
When call extract_jira_id "feat/COMPPLAN-795-add-foo"
The output should equal "COMPPLAN-795"
End

It "drops the .N sub-ticket suffix"
When call extract_jira_id "COMPPLAN-795.2"
The output should equal "COMPPLAN-795"
End

It "drops the .N sub-ticket suffix on a prefixed branch"
When call extract_jira_id "wt/COMPPLAN-795.2/some-slug"
The output should equal "COMPPLAN-795"
End

It "drops a sub-ticket suffix and description suffix together"
When call extract_jira_id "wt/jira-123.1-some-suffix"
The output should equal "JIRA-123"
End

It "stops at a hyphen-digit description suffix"
When call extract_jira_id "jira-123-1"
The output should equal "JIRA-123"
End

It "returns the first match when multiple Jira-style IDs appear"
When call extract_jira_id "FOO-1/touches-BAR-2"
The output should equal "FOO-1"
End

It "extracts a kebab-prefixed lowercase ID anywhere in the branch"
When call extract_jira_id "feat/foo-2"
The output should equal "FOO-2"
End

It "extracts a bare two-letter prefix lowercase ID"
When call extract_jira_id "feat-2"
The output should equal "FEAT-2"
End

It "extracts a lowercase Jira-style ID on an author-prefixed branch"
When call extract_jira_id "wt/mac-130"
The output should equal "MAC-130"
End

It "uppercases a mixed-case Jira-style ID"
When call extract_jira_id "wt/compPlaN-795"
The output should equal "COMPPLAN-795"
End

It "uppercases a bare lowercase Jira-style ID"
When call extract_jira_id "jira-123"
The output should equal "JIRA-123"
End

It "returns empty for a plain word branch"
When call extract_jira_id "main"
The output should equal ""
End
End

Describe "extract_bare_number"
It "extracts a bare number that is the entire branch name"
When call extract_bare_number "152"
The output should equal "152"
End

It "extracts a bare number followed by a separator"
When call extract_bare_number "147/feat/foo"
The output should equal "147"
End

It "extracts a bare number followed by a hyphen"
When call extract_bare_number "42-something"
The output should equal "42"
End

It "extracts a bare number followed by an underscore"
When call extract_bare_number "42_something"
The output should equal "42"
End

It "returns empty when digits are not at the start of the branch name"
When call extract_bare_number "feat/foo-2"
The output should equal ""
End

It "returns empty when the branch contains no digits"
When call extract_bare_number "main"
The output should equal ""
End
End

Describe "read_ticket_ref_prefix"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
}

cleanup_tmpdir() {
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns the value of a single-quoted prefix"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix: 'MAC-'
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal "MAC-"
End

It "returns the value of a double-quoted prefix"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix: "MAC-"
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal "MAC-"
End

It "returns # for a single-quoted hash even when followed by an inline comment"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix: '#' # ignored in file names
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal "#"
End

It "returns the value of an unquoted prefix"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix: MAC-
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal "MAC-"
End

It "strips a trailing inline comment from an unquoted prefix"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix: MAC- # tracked in Jira
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal "MAC-"
End

It "returns empty when the key is absent"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  slug: example
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal ""
End

It "returns empty when the file does not exist"
When call read_ticket_ref_prefix "$tmpdir/nonexistent.yaml"
The output should equal ""
End

It "returns empty when the value is absent"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix:
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal ""
End

It "returns empty when the value is replaced by an inline comment"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  ticket_ref_prefix: # legacy comment, no value
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal ""
End

It "skips a commented-out preference line and reads the active one below it"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  # ticket_ref_prefix: 'OLD-'
  ticket_ref_prefix: 'NEW-'
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal "NEW-"
End

It "returns empty when only a commented-out preference line is present"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
project:
  # ticket_ref_prefix: 'OLD-'
YAML
}
test_read() {
  write_yaml
  read_ticket_ref_prefix "$tmpdir/prefs.yaml"
}
When call test_read
The output should equal ""
End

It "defaults to .agents/preferences.yaml in the current working directory"
prepare() {
  mkdir -p "$tmpdir/workdir/.agents"
  cat >"$tmpdir/workdir/.agents/preferences.yaml" <<'YAML'
project:
  ticket_ref_prefix: 'MAC-'
YAML
  cd "$tmpdir/workdir"
}
test_read() {
  prepare
  read_ticket_ref_prefix
}
When call test_read
The output should equal "MAC-"
End
End

Describe "format_bare_ticket_id"
It "returns the bare number alone for the # prefix"
When call format_bare_ticket_id "152" "#"
The output should equal "152"
End

It "concatenates a Jira-style prefix with the bare number"
When call format_bare_ticket_id "147" "MAC-"
The output should equal "MAC-147"
End

It "returns the bare number alone for an empty prefix"
When call format_bare_ticket_id "42" ""
The output should equal "42"
End
End

Describe "extract_ticket_id (end-to-end via main)"
script="$PROJECT_ROOT/content/scripts/get-ticket-id.sh"

setup_tmpdir() {
  tmpdir=$(mktemp -d)
  original_pwd="$PWD"
  mkdir -p "$tmpdir/workdir/.agents"
  cd "$tmpdir/workdir"
}

cleanup_tmpdir() {
  cd "$original_pwd"
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

# Each end-to-end case runs the script as a child process so the
# preferences-file lookup honors the test's working directory.

It "returns COMPPLAN-795 for an author-prefixed branch"
When run bash "$script" "wt/COMPPLAN-795"
The output should equal "COMPPLAN-795"
The status should be success
End

It "returns JIRA-123 for an embedded ticket inside a slug"
When run bash "$script" "wt/JIRA-123-and-some-message"
The output should equal "JIRA-123"
The status should be success
End

It "returns COMPPLAN-795 for a feat-prefixed branch with a description"
When run bash "$script" "feat/COMPPLAN-795-add-foo"
The output should equal "COMPPLAN-795"
The status should be success
End

It "returns COMPPLAN-795 for a bare Jira-style branch"
When run bash "$script" "COMPPLAN-795"
The output should equal "COMPPLAN-795"
The status should be success
End

It "drops the sub-ticket suffix"
When run bash "$script" "COMPPLAN-795.2"
The output should equal "COMPPLAN-795"
The status should be success
End

It "uppercases a lowercase Jira-style branch"
When run bash "$script" "wt/mac-130"
The output should equal "MAC-130"
The status should be success
End

It "returns 152 for a bare-numeric branch with the # prefix"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
project:
  ticket_ref_prefix: '#'
YAML
}
run_script() {
  write_prefs
  bash "$script" "152"
}
When call run_script
The output should equal "152"
End

It "returns MAC-147 for a bare-numeric branch with a Jira-style prefix"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
project:
  ticket_ref_prefix: 'MAC-'
YAML
}
run_script() {
  write_prefs
  bash "$script" "147/feat/foo"
}
When call run_script
The output should equal "MAC-147"
End

It "returns the bare number when no preferences file exists"
When run bash "$script" "42"
The output should equal "42"
The status should be success
End

It "extracts a kebab-prefixed lowercase ID anywhere in the branch"
When run bash "$script" "feat/foo-2"
The output should equal "FOO-2"
The status should be success
End

It "returns empty for a plain word branch"
When run bash "$script" "main"
The output should equal ""
The status should be success
End

It "prefers a Jira-style match over a leading bare number when both could apply"
When run bash "$script" "123/MAC-456"
The output should equal "MAC-456"
The status should be success
End

It "ignores an inline comment when reading a single-quoted hash prefix"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
project:
  ticket_ref_prefix: '#' # ignored in file names
YAML
}
run_script() {
  write_prefs
  bash "$script" "525"
}
When call run_script
The output should equal "525"
End

It "reads preferences from the repo root when invoked from a subdirectory"
prepare() {
  git -C "$tmpdir/workdir" init --quiet
  cat >"$tmpdir/workdir/.agents/preferences.yaml" <<'YAML'
project:
  ticket_ref_prefix: 'MAC-'
YAML
  mkdir -p "$tmpdir/workdir/packages/nested"
  cd "$tmpdir/workdir/packages/nested"
}
run_script() {
  prepare
  bash "$script" "147"
}
When call run_script
The output should equal "MAC-147"
End
End
