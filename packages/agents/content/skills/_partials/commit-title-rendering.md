```bash
node {harness_home_dir}/scripts/describe-change.mjs \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit_title',''))"
```

Pass `--ticket-ref` from the bundled session-context deriver, so a project whose `commit.title_format` references `{ticket_ref}` renders the ref. Omit any flag whose value is empty or null, `--ticket-ref` included when session context reports it as `null`.

Parse the output with a JSON parser (`python3` above; `jq -r '.commit_title'` where `jq` is available) rather than `grep` or `cut`: A rendered title may contain backslash-escaped double quotes, which a regex extractor silently truncates.

The pipeline prints the rendered title. Read it from the command's output and use it verbatim as the commit title, which already contains the rendered prefix, per the configured `commit.title_format`, and the bare title text. Assigning the parse instead prints nothing, and no shell variable survives to the commit call, so the title must be carried forward as literal text into the message file. Where the script is not found, fall back to the bare `{title}`.
