```bash
json=$({harness_home_dir}/scripts/describe-change.sh \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}")
commit_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit_title',''))")
```

Pass `--ticket-ref` from the bundled session-context deriver, so a project whose `commit.title_format` references `{ticket_ref}` renders the ref. Omit any flag whose value is empty or null, `--ticket-ref` included when session context reports it as `null`.

Parse the output with a JSON parser (`python3` above; `jq -r '.commit_title'` where `jq` is available) rather than `grep` or `cut`: A rendered title may carry backslash-escaped double quotes, which a regex extractor silently truncates.

Use `commit_title` as the commit title verbatim -- it already carries the rendered prefix, per the configured `commit.title_format`, and the bare title text. Where the script is not found, fall back to the bare `{title}`.
