#!/usr/bin/env bash

# The workspace helpers under test come from spec/spec_helper.sh, which shellspec loads via --require.

Describe "workspace helpers under a failing mktemp"
setup_failing_mktemp() {
  # Run from a throwaway directory so a broken guard writes there rather than into the repository.
  enter_tmpdir || return 1
  # Hold both paths separately: the calls under test reassign `tmpdir` and `original_pwd`.
  stub_dir="$tmpdir"
  saved_pwd="$original_pwd"
  mkdir -p bin
  # Shadow `mktemp` rather than pointing TMPDIR at an unwritable path: a stub fails on every platform and under any
  # sandbox, where an unwritable path depends on what this machine lets the suite create.
  cat >bin/mktemp <<'STUB'
#!/usr/bin/env bash
echo "mktemp: stubbed failure" >&2
exit 1
STUB
  chmod +x bin/mktemp
}

cleanup_failing_mktemp() {
  cd "$saved_pwd" && rm -rf "$stub_dir"
}

BeforeEach "setup_failing_mktemp"
AfterEach "cleanup_failing_mktemp"

It "fails without assigning a directory"
attempt_make() {
  PATH="$stub_dir/bin:$PATH" make_tmpdir
}
When call attempt_make
The status should be failure
The stderr should include "stubbed failure"
The variable tmpdir should equal ""
End

It "stops a guarded hook before it writes its fixtures"
attempt_hook() {
  PATH="$stub_dir/bin:$PATH" enter_tmpdir || return 1
  mkdir -p src
  : >lookup.md
}
When call attempt_hook
The status should be failure
The directory "src" should not be exist
The file "lookup.md" should not be exist
The stderr should include "stubbed failure"
End
End
