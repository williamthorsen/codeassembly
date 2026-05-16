Run `resolve-frontmatter.sh` via the Bash tool. It emits a JSON object with the universal artifact fields (`branch`, `commit`, `baseSha`, `pr`, `ticket_id`, `ticket_ref`, `platform`, `timestamp`, `run_id`). Use those values verbatim for the matching YAML keys. Optional fields the script omits from its output (`baseSha`, `pr`, `ticket_id`, `ticket_ref`, `run_id`) must be omitted from the frontmatter too — do not emit `null` or empty strings.

If the script's stderr contains `Note: PR lookup failed; proceeding without pr field.`, surface that line in your text output once.

Set these skill-specific values inline (not in the script's output):
<!-- children -->
