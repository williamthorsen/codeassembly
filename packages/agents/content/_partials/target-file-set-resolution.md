## Target file set

Resolve the set of files that the run may edit once, before reading any of them, and never widen it afterwards.

**Expanding a path argument.** A path naming a file adds that file. A path naming a directory adds what git lists beneath it:

```bash
git ls-files -- <path>
git ls-files --others --exclude-standard -- <path>
```

The two forms together cover what git tracks plus what it would track, and both honor `.gitignore`, so `node_modules/`, `dist/`, and every other non-authored tree stay out for free.

**What never enters the set.** Three kinds of file are held out, each because an edit to it would be discarded or would rewrite a record:

- **Deployed output.** A file carrying a `GENERATED FILE` or `<!-- codeassembly-` marker, and anything beneath a harness's own `skills/` or `scripts/` directory. The next sync overwrites it, so the edit belongs to the source it was copied from.
- **Sealed artifacts.** Anything beneath the artifact base directory, typically `~/ai-artifacts/`. A saved artifact records a moment and stays as written.
- **Text nobody here authored.** Vendored third-party sources, generated data, and test fixtures, whatever they contain.

<HARD-GATE>
Never edit a file outside the resolved set. Do not follow imports, expand to siblings, or touch a file merely reachable from one already in the set. Report a hit outside the set to the user alongside the summary; never repair it.
</HARD-GATE>
