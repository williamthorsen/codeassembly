# ShellSpec spec helper

shellspec_spec_helper_configure() {
  # Absolute path to the project root, usable in Include directives.
  PROJECT_ROOT="${SHELLSPEC_HELPERDIR}/.."
  export GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_SYSTEM=/dev/null
}

# Creates a temporary directory and assigns its path to `tmpdir`.
#
# The template is rooted at `$TMPDIR` because bare `mktemp -d` reads the Darwin per-user temp directory instead, which
# the agent sandbox denies. The X run stays at the end, the only position macOS substitutes.
make_tmpdir() {
  tmpdir_base="${TMPDIR:-/tmp}"
  tmpdir=$(mktemp -d "${tmpdir_base%/}/agents-spec.XXXXXX") && [ -d "$tmpdir" ]
}

# Removes the temporary directory created by `make_tmpdir`.
remove_tmpdir() {
  rm -rf "$tmpdir"
}

# Creates a temporary directory and makes it the working directory, saving the previous one in `original_pwd`.
enter_tmpdir() {
  make_tmpdir && original_pwd="$PWD" && cd "$tmpdir"
}

# Restores the working directory and removes the temporary directory.
leave_tmpdir() {
  cd "$original_pwd" && rm -rf "$tmpdir"
}
