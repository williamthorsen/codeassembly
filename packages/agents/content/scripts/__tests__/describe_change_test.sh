#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/describe-change.sh"

Describe "parse_prefix"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
}

cleanup_tmpdir() {
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns FOUND:{value} when key is present"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}({scope})"
End

It "returns nothing when key is absent"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  other_key: value
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal ""
End

It "returns nothing when file does not exist"
When call parse_prefix "$tmpdir/nonexistent.yaml" "commit"
The output should equal ""
End

It "returns FOUND: (empty) when prefix key is present with no value"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix:
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:"
End

It "strips inline comments"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})' # conventional commits
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}({scope})"
End

It "strips surrounding single quotes"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix: '{scope}|{type}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{scope}|{type}"
End

It "strips surrounding double quotes"
write_yaml() {
  printf 'commit:\n  prefix: "%s"\n' '{type}' >"$tmpdir/prefs.yaml"
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}"
End

It "parses quoted values containing pipe characters"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix: '{scope}|{type}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{scope}|{type}"
End

It "returns FOUND: for explicitly empty quoted string"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix: ''
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:"
End

It "matches the correct section"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
ticket:
  prefix: '{type}'
pr:
  prefix: ''
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "ticket"
}
When call test_parse
The output should equal "FOUND:{type}"
End

It "skips comment-only lines"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
# top-level comment
commit:
  # indented comment
  prefix: '{type}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}"
End
End

Describe "resolve_prefix"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
  # Override HOME and working directory to isolate preference resolution.
  original_home="$HOME"
  original_pwd="$PWD"
  export HOME="$tmpdir/home"
  mkdir -p "$HOME/.agents"
  mkdir -p "$tmpdir/workdir/.agents"
  cd "$tmpdir/workdir"
}

cleanup_tmpdir() {
  export HOME="$original_home"
  cd "$original_pwd"
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns empty when no preferences files exist"
When call resolve_prefix "commit"
The output should equal ""
End

It "uses global preferences when project file is absent"
write_global() {
  cat >"$HOME/.agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
YAML
}
test_resolve() {
  write_global
  resolve_prefix "commit"
}
When call test_resolve
The output should equal "{type}({scope})"
End

It "uses project preferences over global preferences"
write_both() {
  cat >"$HOME/.agents/preferences.yaml" <<'YAML'
commit:
  prefix: 'global-convention'
YAML
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: 'project-convention'
YAML
}
test_resolve() {
  write_both
  resolve_prefix "commit"
}
When call test_resolve
The output should equal "project-convention"
End

It "allows project empty string to override global non-empty (FOUND: sentinel)"
write_both() {
  cat >"$HOME/.agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
YAML
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: ''
YAML
}
test_resolve() {
  write_both
  resolve_prefix "commit"
}
When call test_resolve
The output should equal ""
End
End

Describe "format_prefix"
It "returns empty for empty convention"
scope="agents" type="feat"
When call format_prefix ""
The output should equal ""
End

It "returns empty when neither scope nor type is provided"
scope="" type=""
When call format_prefix "{type}({scope})"
The output should equal ""
End

It "returns empty when only scope is provided (no type)"
scope="agents" type=""
When call format_prefix "{type}({scope})"
The output should equal ""
End

It "returns '{type}: ' when only type is provided (no scope)"
scope="" type="feat"
When call format_prefix "{type}({scope})"
The output should equal "feat: "
End

It "formats type(scope) convention with both scope and type"
scope="agents" type="feat"
When call format_prefix "{type}({scope})"
The output should equal "feat(agents): "
End

It "formats scope|type convention with both scope and type"
scope="agents" type="feat"
When call format_prefix "{scope}|{type}"
The output should equal "agents|feat: "
End

It "formats type-only convention with both scope and type"
scope="agents" type="feat"
When call format_prefix "{type}"
The output should equal "feat: "
End

It "returns '{type}: ' for type-only convention with only type"
scope="" type="fix"
When call format_prefix "{type}"
The output should equal "fix: "
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

It "escapes both backslashes and double quotes"
When call json_escape 'a\"b'
The output should equal 'a\\\"b'
End

It "passes through strings with no special characters"
When call json_escape "hello"
The output should equal "hello"
End

It "returns empty for empty input"
When call json_escape ""
The output should equal ""
End
End

Describe "end-to-end JSON output"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
  original_home="$HOME"
  original_pwd="$PWD"
  export HOME="$tmpdir/home"
  mkdir -p "$HOME/.agents"
  mkdir -p "$tmpdir/workdir/.agents"
  cd "$tmpdir/workdir"
}

cleanup_tmpdir() {
  export HOME="$original_home"
  cd "$original_pwd"
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

script="$PROJECT_ROOT/content/scripts/describe-change.sh"

It "produces valid JSON with all empty prefixes when no preferences exist"
When run bash "$script" --scope "agents" --type "feat"
The output should equal '{"commit_prefix":"","ticket_prefix":"","pr_prefix":""}'
The status should be success
End

It "produces valid JSON with configured prefixes"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
ticket:
  prefix: '{type}'
pr:
  prefix: ''
YAML
}
run_script() {
  write_prefs
  bash "$script" --scope "agents" --type "feat"
}
When call run_script
The output should equal '{"commit_prefix":"feat(agents): ","ticket_prefix":"feat: ","pr_prefix":""}'
End

It "produces valid JSON with scope|type convention"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{scope}|{type}'
YAML
}
run_script() {
  write_prefs
  bash "$script" --scope "agents" --type "feat"
}
When call run_script
The output should equal '{"commit_prefix":"agents|feat: ","ticket_prefix":"","pr_prefix":""}'
End

It "produces all empty prefixes with only --scope (no --type)"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
YAML
}
run_script() {
  write_prefs
  bash "$script" --scope "agents"
}
When call run_script
The output should equal '{"commit_prefix":"","ticket_prefix":"","pr_prefix":""}'
End

It "produces all empty prefixes with no arguments"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{type}({scope})'
YAML
}
run_script() {
  write_prefs
  bash "$script"
}
When call run_script
The output should equal '{"commit_prefix":"","ticket_prefix":"","pr_prefix":""}'
End

It "handles JSON-special characters in prefix values"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  prefix: '{type}'
YAML
}
run_script() {
  write_prefs
  bash "$script" --type 'a"b\c'
}
When call run_script
The output should equal '{"commit_prefix":"a\"b\\c: ","ticket_prefix":"","pr_prefix":""}'
End
End
