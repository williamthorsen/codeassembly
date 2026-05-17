# ShellSpec spec helper

shellspec_spec_helper_configure() {
  # Absolute path to the project root, usable in Include directives.
  PROJECT_ROOT="${SHELLSPEC_HELPERDIR}/.."
  export GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_SYSTEM=/dev/null
}
