#!/usr/bin/env bash

# Terminal color definitions for shell scripts.
#
# Source this file to use color variables in a script.
# Uses conditional assignment so that callers can override colors before sourcing.
#
# Usage:
#   source "$repo_dir/functions/colors.sh"

: "${green:=$(tput setaf 2)}"
: "${yellow:=$(tput setaf 3)}"
: "${red:=$(tput setaf 1)}"
: "${normal:=$(tput sgr0)}"
