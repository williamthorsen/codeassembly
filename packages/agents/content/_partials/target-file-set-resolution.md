## Target file set

Before reading any file, resolve once the set of files that the run may edit, and never widen it afterwards.

**Expanding a path argument.** A path naming a file adds that file. A path naming a directory adds what git lists beneath it:

```bash
git ls-files -- <path>
git ls-files --others --exclude-standard -- <path>
```

The two forms together cover what git tracks plus what it would track, and both honor `.gitignore`, so `node_modules/`, `dist/`, and every other non-authored tree are excluded with no further configuration.

**What never enters the set.** Three kinds of file are excluded, each because an edit to it would be discarded or would rewrite a record:

- **Deployed output.** A file containing a `GENERATED FILE` or `<!-- codeassembly-` marker, and anything beneath a harness's own `skills/` or `scripts/` directory. Because the next sync overwrites it, the edit belongs to the source from which it was copied.
- **Saved artifacts.** Anything beneath the artifact base directory, typically `~/ai-artifacts/`.
- **Text that nobody here authored.** Vendored third-party sources, generated data, and test fixtures, whatever they contain.

<HARD-GATE>
Never edit a file outside the resolved set. Do not follow imports, expand to siblings, or touch a file merely reachable from one already in the set. Report a hit outside the set to the user alongside the summary; never repair it.
</HARD-GATE>
