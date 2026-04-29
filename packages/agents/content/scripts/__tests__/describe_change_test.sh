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

It "returns FOUND:{value} when title_format key is present"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  title_format: '{scope}|{type}: {title}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{scope}|{type}: {title}"
End

It "returns nothing when title_format key is absent"
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

It "returns FOUND: (empty) when title_format key is present with no value"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  title_format:
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
  title_format: '{type}({scope}): {title}' # conventional commits
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}({scope}): {title}"
End

It "strips surrounding single quotes"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  title_format: '{scope}|{type}: {title}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{scope}|{type}: {title}"
End

It "strips surrounding double quotes"
write_yaml() {
  printf 'commit:\n  title_format: "%s"\n' '{type}: {title}' >"$tmpdir/prefs.yaml"
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}: {title}"
End

It "parses quoted values containing pipe characters"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  title_format: '{scope}|{type}: {title}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{scope}|{type}: {title}"
End

It "returns FOUND: for explicitly empty quoted string"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  title_format: ''
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
  title_format: '{type}({scope}): {title}'
ticket:
  title_format: '{title}'
pr:
  title_format: ''
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "ticket"
}
When call test_parse
The output should equal "FOUND:{title}"
End

It "matches the merge_commit section"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
commit:
  title_format: '{title}'
merge_commit:
  title_format: '[{ticket_ref} ]{title}[ (#{pr_number})]'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "merge_commit"
}
When call test_parse
The output should equal "FOUND:[{ticket_ref} ]{title}[ (#{pr_number})]"
End

It "skips comment-only lines"
write_yaml() {
  cat >"$tmpdir/prefs.yaml" <<'YAML'
# top-level comment
commit:
  # indented comment
  title_format: '{type}: {title}'
YAML
}
test_parse() {
  write_yaml
  parse_prefix "$tmpdir/prefs.yaml" "commit"
}
When call test_parse
The output should equal "FOUND:{type}: {title}"
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
  title_format: '{type}({scope}): {title}'
YAML
}
test_resolve() {
  write_global
  resolve_prefix "commit"
}
When call test_resolve
The output should equal "{type}({scope}): {title}"
End

It "uses project preferences over global preferences"
write_both() {
  cat >"$HOME/.agents/preferences.yaml" <<'YAML'
commit:
  title_format: 'global-template'
YAML
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: 'project-template'
YAML
}
test_resolve() {
  write_both
  resolve_prefix "commit"
}
When call test_resolve
The output should equal "project-template"
End

It "allows project empty string to override global non-empty (FOUND: sentinel)"
write_both() {
  cat >"$HOME/.agents/preferences.yaml" <<'YAML'
commit:
  title_format: '{type}({scope}): {title}'
YAML
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: ''
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

Describe "render_title"
It "returns empty for empty template"
scope="agents" type="feat" title="Add foo" ticket_ref="" pr_number=""
When call render_title ""
The output should equal ""
End

It "substitutes the {title} token alone"
scope="" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "{title}"
The output should equal "Add foo"
End

It "substitutes the {scope} token alone"
scope="agents" type="" title="" ticket_ref="" pr_number=""
When call render_title "{scope}"
The output should equal "agents"
End

It "substitutes the {type} token alone"
scope="" type="feat" title="" ticket_ref="" pr_number=""
When call render_title "{type}"
The output should equal "feat"
End

It "substitutes the {ticket_ref} token alone"
scope="" type="" title="" ticket_ref="#466" pr_number=""
When call render_title "{ticket_ref}"
The output should equal "#466"
End

It "substitutes the {pr_number} token alone"
scope="" type="" title="" ticket_ref="" pr_number="470"
When call render_title "{pr_number}"
The output should equal "470"
End

It "substitutes all five tokens together"
scope="agents" type="feat" title="Add foo" ticket_ref="#466" pr_number="470"
When call render_title "{ticket_ref} {scope}|{type}: {title} (#{pr_number})"
The output should equal "#466 agents|feat: Add foo (#470)"
End

It "leaves unknown tokens as-is"
scope="agents" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "{scope}: {title} {typo}"
The output should equal "agents: Add foo {typo}"
End

It "drops a single optional group when its token is empty"
scope="" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "[{ticket_ref} ]{title}"
The output should equal "Add foo"
End

It "renders an optional group verbatim when all tokens populated"
scope="" type="" title="Add foo" ticket_ref="#466" pr_number=""
When call render_title "[{ticket_ref} ]{title}"
The output should equal "#466 Add foo"
End

It "drops the entire group including literals when any inner token is empty"
scope="agents" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "[{scope}|{type}: ]{title}"
The output should equal "Add foo"
End

It "drops multiple optional groups independently"
scope="" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]"
The output should equal "Add foo"
End

It "renders multiple optional groups when all tokens populated (squash-merge shape)"
scope="agents" type="feat" title="Add foo" ticket_ref="#466" pr_number="470"
When call render_title "[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]"
The output should equal "#466 agents|feat: Add foo (#470)"
End

It "renders the squash-merge shape with no ticket_ref"
scope="agents" type="feat" title="Add foo" ticket_ref="" pr_number="470"
When call render_title "[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]"
The output should equal "agents|feat: Add foo (#470)"
End

It "renders the squash-merge shape with no scope or type"
scope="" type="" title="Add foo" ticket_ref="#466" pr_number="470"
When call render_title "[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]"
The output should equal "#466 Add foo (#470)"
End

It "renders the squash-merge shape with no pr_number"
scope="agents" type="feat" title="Add foo" ticket_ref="#466" pr_number=""
When call render_title "[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]"
The output should equal "#466 agents|feat: Add foo"
End

It "collapses double spaces left after dropped groups"
scope="" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "[{ticket_ref}] {title} [{pr_number}]"
The output should equal "Add foo"
End

It "trims leading and trailing whitespace from rendered output"
scope="" type="" title="Add foo" ticket_ref="" pr_number=""
When call render_title "  {title}  "
The output should equal "Add foo"
End

It "preserves single spaces inside the rendered title"
scope="" type="" title="Add foo bar baz" ticket_ref="" pr_number=""
When call render_title "{title}"
The output should equal "Add foo bar baz"
End

It "renders a literal-only template"
scope="" type="" title="" ticket_ref="" pr_number=""
When call render_title "literal text"
The output should equal "literal text"
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

It "produces all four empty title fields when no preferences exist"
When run bash "$script" --scope "agents" --type "feat" --title "Add foo"
The output should equal '{"commit_title":"","ticket_title":"","pr_title":"","merge_commit_title":""}'
The status should be success
End

It "renders the four title fields from the squash-merge convention"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: '[{scope}|{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}'
merge_commit:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'
YAML
}
run_script() {
  write_prefs
  bash "$script" --scope "agents" --type "feat" --title "Add foo" --ticket-ref "#466" --pr-number "470"
}
When call run_script
The output should equal '{"commit_title":"agents|feat: Add foo","ticket_title":"Add foo","pr_title":"#466 agents|feat: Add foo","merge_commit_title":"#466 agents|feat: Add foo (#470)"}'
End

It "drops optional groups when their tokens are absent"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: '[{scope}|{type}: ]{title}'
pr:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}'
YAML
}
run_script() {
  write_prefs
  bash "$script" --title "Add foo"
}
When call run_script
The output should equal '{"commit_title":"Add foo","ticket_title":"","pr_title":"Add foo","merge_commit_title":""}'
End

It "treats an empty title_format as opt-out"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: ''
ticket:
  title_format: '{title}'
YAML
}
run_script() {
  write_prefs
  bash "$script" --title "Add foo"
}
When call run_script
The output should equal '{"commit_title":"","ticket_title":"Add foo","pr_title":"","merge_commit_title":""}'
End

It "produces all empty titles with no arguments"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: '[{scope}|{type}: ]{title}'
YAML
}
run_script() {
  write_prefs
  bash "$script"
}
When call run_script
The output should equal '{"commit_title":"","ticket_title":"","pr_title":"","merge_commit_title":""}'
End

It "preserves JSON-special characters in title text through render"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: '{title}'
YAML
}
run_script() {
  write_prefs
  bash "$script" --title 'a"b\c'
}
When call run_script
The output should equal '{"commit_title":"a\"b\\c","ticket_title":"","pr_title":"","merge_commit_title":""}'
End

It "renders a template that has no {title} token (no implicit insertion)"
write_prefs() {
  cat >".agents/preferences.yaml" <<'YAML'
commit:
  title_format: '{scope}|{type}'
YAML
}
run_script() {
  write_prefs
  bash "$script" --scope "agents" --type "feat" --title "Add foo"
}
When call run_script
The output should equal '{"commit_title":"agents|feat","ticket_title":"","pr_title":"","merge_commit_title":""}'
End
End
