#!/usr/bin/env bash

# Source the script under test (main guard prevents execution).
Include "$PROJECT_ROOT/content/scripts/resolve-reviewer-context.sh"

Describe "is_scannable_extension"
It "accepts .ts files"
When call is_scannable_extension "src/foo.ts"
The status should be success
End

It "accepts .tsx files"
When call is_scannable_extension "src/foo.tsx"
The status should be success
End

It "accepts .js files"
When call is_scannable_extension "src/foo.js"
The status should be success
End

It "accepts .jsx files"
When call is_scannable_extension "src/foo.jsx"
The status should be success
End

It "accepts .mjs files"
When call is_scannable_extension "src/foo.mjs"
The status should be success
End

It "accepts .cjs files"
When call is_scannable_extension "src/foo.cjs"
The status should be success
End

It "accepts .mts files"
When call is_scannable_extension "src/foo.mts"
The status should be success
End

It "accepts .cts files"
When call is_scannable_extension "src/foo.cts"
The status should be success
End

It "rejects .md files"
When call is_scannable_extension "README.md"
The status should be failure
End

It "rejects files with no extension"
When call is_scannable_extension "Makefile"
The status should be failure
End

It "rejects .json files"
When call is_scannable_extension "package.json"
The status should be failure
End
End

Describe "collect_lookup_keys"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
  lookup="$tmpdir/lookup.md"
}

cleanup_tmpdir() {
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns keys in declaration order"
test_keys() {
  cat >"$lookup" <<'MD'
## @hyperjump/json-schema
A gotcha.

## react
Another gotcha.
MD
  collect_lookup_keys
}
When call test_keys
The line 1 of output should equal "@hyperjump/json-schema"
The line 2 of output should equal "react"
End

It "returns empty when the lookup table has no headings"
test_keys() {
  cat >"$lookup" <<'MD'
This file has prose but no section headings.
MD
  collect_lookup_keys
}
When call test_keys
The output should equal ""
End

It "ignores non-section-header content (prologue is permitted)"
test_keys() {
  cat >"$lookup" <<'MD'
# Top-level title
Some prologue text.

## pkg-a
Body A.
MD
  collect_lookup_keys
}
When call test_keys
The output should equal "pkg-a"
End
End

Describe "extract_section_body"
setup_tmpdir() {
  tmpdir=$(mktemp -d)
  lookup="$tmpdir/lookup.md"
  cat >"$lookup" <<'MD'
## pkg-a
Body A line 1.
Body A line 2.

## pkg-b
Body B only line.
MD
}

cleanup_tmpdir() {
  rm -rf "$tmpdir"
}

BeforeEach "setup_tmpdir"
AfterEach "cleanup_tmpdir"

It "returns the body of a matching section, trailing blank lines stripped"
When call extract_section_body "pkg-a"
The line 1 of output should equal "Body A line 1."
The line 2 of output should equal "Body A line 2."
The lines of output should equal 2
End

It "returns the body of the last section in the file"
When call extract_section_body "pkg-b"
The output should equal "Body B only line."
End

It "returns empty when no section matches"
When call extract_section_body "pkg-missing"
The output should equal ""
End
End

Describe "end-to-end script behavior"
setup_workspace() {
  tmpdir=$(mktemp -d)
  original_pwd="$PWD"
  cd "$tmpdir"
  mkdir -p src

  cat >lookup.md <<'MD'
## @hyperjump/json-schema
First gotcha.

## react
Second gotcha.
MD
}

cleanup_workspace() {
  cd "$original_pwd"
  rm -rf "$tmpdir"
}

BeforeEach "setup_workspace"
AfterEach "cleanup_workspace"

script="$PROJECT_ROOT/content/scripts/resolve-reviewer-context.sh"

It "exits 0 with empty stdout when changed files are non-source (no match)"
run_no_match() {
  echo "README.md" >changed.txt
  echo "docs/intro.md" >>changed.txt
  bash "$script" --changed-files changed.txt --lookup lookup.md
}
When call run_no_match
The output should equal ""
The status should be success
End

It "emits only the sidecar content when no lookup keys match"
run_sidecar_only() {
  cat >sidecar.md <<'SM'
Coder note: Handler X swallows errors when Y is undefined.
SM
  : >changed.txt
  bash "$script" --sidecar sidecar.md --changed-files changed.txt --lookup lookup.md
}
When call run_sidecar_only
The output should equal "Coder note: Handler X swallows errors when Y is undefined."
The status should be success
End

It "emits a matched lookup section when a TS file imports the package"
run_ts_match() {
  cat >src/foo.ts <<'TS'
import { FLAG } from '@hyperjump/json-schema/draft-2020-12';
TS
  echo "src/foo.ts" >changed.txt
  bash "$script" --changed-files changed.txt --lookup lookup.md
}
When call run_ts_match
The output should include "## @hyperjump/json-schema"
The output should include "First gotcha."
The output should not include "Coder note"
The status should be success
End

It "emits a matched lookup section when a JS file requires the package"
run_require_match() {
  cat >src/bar.js <<'JS'
const r = require('react');
JS
  echo "src/bar.js" >changed.txt
  bash "$script" --changed-files changed.txt --lookup lookup.md
}
When call run_require_match
The output should include "## react"
The output should include "Second gotcha."
The status should be success
End

It "emits sidecar content first, then a blank separator, then a matched lookup section"
run_both() {
  cat >sidecar.md <<'SM'
Coder note: Handler X swallows errors when Y is undefined.
SM
  cat >src/foo.ts <<'TS'
import { FLAG } from '@hyperjump/json-schema';
TS
  echo "src/foo.ts" >changed.txt
  bash "$script" --sidecar sidecar.md --changed-files changed.txt --lookup lookup.md
}
When call run_both
The line 1 of output should equal "Coder note: Handler X swallows errors when Y is undefined."
The line 2 of output should equal ""
The line 3 of output should equal "## @hyperjump/json-schema"
The output should include "First gotcha."
The status should be success
End

It "emits multiple matched sections in lookup-table declaration order"
run_multi() {
  cat >src/a.ts <<'TS'
import { FLAG } from '@hyperjump/json-schema';
TS
  cat >src/b.ts <<'TS'
import React from 'react';
TS
  echo "src/a.ts" >changed.txt
  echo "src/b.ts" >>changed.txt
  bash "$script" --changed-files changed.txt --lookup lookup.md
}
When call run_multi
# @hyperjump/json-schema is declared first in the lookup table.
The line 1 of output should equal "## @hyperjump/json-schema"
The output should include "## react"
The output should include "First gotcha."
The output should include "Second gotcha."
The status should be success
End

It "skips non-JS files even when they contain literal import statements"
run_md_skip() {
  cat >notes.md <<'NOTES'
Example: import x from 'react';
NOTES
  echo "notes.md" >changed.txt
  bash "$script" --changed-files changed.txt --lookup lookup.md
}
When call run_md_skip
The output should equal ""
The status should be success
End

It "silently skips changed-files entries that no longer exist on disk"
run_missing_file() {
  echo "src/deleted.ts" >changed.txt
  bash "$script" --changed-files changed.txt --lookup lookup.md
}
When call run_missing_file
The output should equal ""
The status should be success
The stderr should equal ""
End

It "exits 1 with stderr message when --lookup points to a missing file"
run_missing_lookup() {
  : >changed.txt
  bash "$script" --changed-files changed.txt --lookup "$tmpdir/nope.md"
}
When call run_missing_lookup
The status should equal 1
The stderr should include "Cannot read --lookup"
End

It "exits 1 with stderr message when --lookup contains no '## ' section headings"
run_malformed_lookup() {
  cat >malformed.md <<'MD'
# Top-level title

Some prose explaining the file but no package sections.
Another paragraph here.
MD
  : >changed.txt
  bash "$script" --changed-files changed.txt --lookup malformed.md
}
When call run_malformed_lookup
The status should equal 1
The stderr should include "no package sections"
End

It "exits 0 with empty stdout when --sidecar points to a nonexistent path"
run_missing_sidecar() {
  : >changed.txt
  bash "$script" --sidecar "$tmpdir/nonexistent-sidecar.md" --changed-files changed.txt --lookup lookup.md
}
When call run_missing_sidecar
The status should be success
The output should equal ""
End

It "exits 0 with empty stdout when --sidecar points to an empty file"
run_empty_sidecar() {
  : >sidecar.md
  : >changed.txt
  bash "$script" --sidecar sidecar.md --changed-files changed.txt --lookup lookup.md
}
When call run_empty_sidecar
The status should be success
The output should equal ""
End

It "exits 1 with stderr message when --changed-files is missing"
When run bash "$script" --lookup lookup.md
The status should equal 1
The stderr should include "Missing required flag: --changed-files"
End

It "exits 1 with stderr message when --lookup is missing"
run_missing_lookup_flag() {
  : >changed.txt
  bash "$script" --changed-files changed.txt
}
When call run_missing_lookup_flag
The status should equal 1
The stderr should include "Missing required flag: --lookup"
End

It "exits 1 with stderr message on an unknown option"
When run bash "$script" --bogus
The status should equal 1
The stderr should include "Unknown option: --bogus"
End

It "exits 0 and prints usage to stdout when --help is passed"
When run bash "$script" --help
The status should equal 0
The output should include "Usage:"
The output should include "--changed-files FILE"
The output should include "--lookup PATH"
The output should include "--sidecar PATH"
End
End
