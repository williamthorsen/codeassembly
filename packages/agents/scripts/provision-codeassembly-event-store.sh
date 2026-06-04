#!/usr/bin/env bash
set -euo pipefail

# provision-codeassembly-event-store.sh — Stand up the user-global `codeassembly` knowledge store.
#
# Idempotently creates the store vault, installs its kind-aware `.kb/schema.yaml` from the committed template, and
# registers the store (non-default) in the user-global `~/.agents/kb.yaml`. Re-running is safe: an existing vault,
# schema, or registry entry is left untouched. The script never overwrites an existing schema or registry entry.
#
# This is the one step that mutates user-global state outside the repo. It is delivered as a script the user runs
# themselves rather than executed as part of any build or test.
#
# Usage:
#   provision-codeassembly-event-store.sh [--vault-dir DIR] [--registry FILE] [--dry-run]
#   provision-codeassembly-event-store.sh --help
#
# Options:
#   --vault-dir DIR   Store root directory.   Default: ~/repos/vaults/codeassembly
#   --registry FILE   User-global registry.   Default: ~/.agents/kb.yaml
#   --dry-run         Print the actions without writing anything.
#   --help            Show this help and exit.

readonly PROG="$(basename "$0")"
readonly STORE_NAME="codeassembly"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TEMPLATE_SCHEMA="${SCRIPT_DIR}/../templates/codeassembly-event-store/.kb/schema.yaml"

# Resolve the default tilde-expanded paths.
default_vault_dir() { echo "${HOME}/repos/vaults/${STORE_NAME}"; }
default_registry() { echo "${HOME}/.agents/kb.yaml"; }

# Main flow
main() {
  local vault_dir registry dry_run="false"
  vault_dir="$(default_vault_dir)"
  registry="$(default_registry)"

  while [[ $# -gt 0 ]]; do
    case "$1" in
    --help | -h) show_usage 0 ;;
    --vault-dir)
      vault_dir="${2:?--vault-dir requires a value}"
      shift
      ;;
    --vault-dir=*) vault_dir="${1#*=}" ;;
    --registry)
      registry="${2:?--registry requires a value}"
      shift
      ;;
    --registry=*) registry="${1#*=}" ;;
    --dry-run) dry_run="true" ;;
    -*)
      echo "${PROG}: unknown option $1" >&2
      show_usage 1
      ;;
    *)
      echo "${PROG}: unexpected argument $1" >&2
      show_usage 1
      ;;
    esac
    shift
  done

  if [[ ! -f "${TEMPLATE_SCHEMA}" ]]; then
    echo "${PROG}: schema template not found at ${TEMPLATE_SCHEMA}" >&2
    exit 1
  fi

  install_schema "${vault_dir}" "${dry_run}"
  register_store "${vault_dir}" "${registry}" "${dry_run}"

  echo "${PROG}: done. Store \"${STORE_NAME}\" provisioned at ${vault_dir}."
}

# Create the vault and its `.kb/schema.yaml` from the template, without overwriting an existing schema.
install_schema() {
  local vault_dir="$1" dry_run="$2"
  local schema_dest="${vault_dir}/.kb/schema.yaml"

  if [[ -f "${schema_dest}" ]]; then
    echo "${PROG}: schema already present at ${schema_dest} — leaving untouched."
    return 0
  fi

  if [[ "${dry_run}" == "true" ]]; then
    echo "${PROG}: [dry-run] would create ${vault_dir}/.kb/ and install schema from template."
    return 0
  fi

  mkdir -p "${vault_dir}/.kb" "${vault_dir}/events"
  cp "${TEMPLATE_SCHEMA}" "${schema_dest}"
  echo "${PROG}: installed schema at ${schema_dest}."
}

# Register the store (non-default) in the user-global registry, without overwriting an existing entry.
register_store() {
  local vault_dir="$1" registry="$2" dry_run="$3"

  if [[ -f "${registry}" ]] && grep -qE "^[[:space:]]+${STORE_NAME}:[[:space:]]*$" "${registry}"; then
    echo "${PROG}: registry already contains \"${STORE_NAME}\" in ${registry} — leaving untouched."
    return 0
  fi

  if [[ "${dry_run}" == "true" ]]; then
    echo "${PROG}: [dry-run] would register \"${STORE_NAME}\" -> ${vault_dir} in ${registry}."
    return 0
  fi

  mkdir -p "$(dirname "${registry}")"

  if [[ ! -f "${registry}" ]]; then
    printf 'kbs:\n' >"${registry}"
  elif ! grep -qE "^kbs:[[:space:]]*$" "${registry}"; then
    echo "${PROG}: ${registry} has no top-level \`kbs:\` key; add the entry below manually:" >&2
    print_registry_entry "${vault_dir}" >&2
    exit 1
  fi

  print_registry_entry "${vault_dir}" >>"${registry}"
  echo "${PROG}: registered \"${STORE_NAME}\" in ${registry}."
}

# Emit the two-space-indented registry block for the store.
print_registry_entry() {
  local vault_dir="$1"
  cat <<EOF
  ${STORE_NAME}:
    path: ${vault_dir}
    description: Unified knowledge substrate — events and assertions
EOF
}

show_usage() {
  sed -n '4,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

main "$@"
