---
title: Links
recordType: assertion
created: 2026-05-01T07:38:12Z
updated: 2026-05-01T16:08:41Z
tags: [example]
---

A resolved link to [[Target alpha]] works.

An aliased link [[Target alpha|the alpha note]] resolves the same.

An anchored link [[Target alpha#Section]] resolves to the basename.

An unresolved link [[Ghost note]] points at nothing.

An ambiguous link [[Shared]] matches two notes.

Inline code `[[plugins]]` is not a wikilink.

```bash
if [[ -n "$value" ]]; then echo "[[NotALink]]"; fi
```
