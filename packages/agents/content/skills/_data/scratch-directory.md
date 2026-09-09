# Scratch directory

Where a scratch file goes, and what each rule prevents.

The contract comes first; the reasoning behind it follows. Skills inline the contract rather than linking to it, so what they consult here is the reasoning.

<!-- include: ../../_partials/scratch-directory.md / -->

## Why not `$TMPDIR` itself

`$TMPDIR` resolves to a directory scoped by uid rather than by session, so every concurrent agent session running as that user shares it. A filename that does not vary by session is overwritten in silence, and the write that loses is the one that ran first.

During a `merge-pr` run, the merge-commit body was written to `$TMPDIR/merge-body.md`. Between that write and the copy that staged the file for `gh`, another session overwrote it with unrelated content. The wrong body was caught because the file happened to be printed before the merge ran, not by any check. A squash-merge title and body cannot be amended on a protected default branch, so publishing it would have been irreversible.

A timestamp in the name does not close this. It disambiguates within one session and not across two started in the same second, and it makes the collision rarer rather than impossible, which is the worst property a hazard can have.

## Why not bare `mktemp -d`

BSD `mktemp` with no template resolves `confstr(_CS_DARWIN_USER_TEMP_DIR)`, not `$TMPDIR`. That path is outside the agent sandbox's write allowlist, so the command exits 1 with empty stdout:

```
mktemp: mkdtemp failed on /var/folders/f_/kz921xwd09jdb68d8qv_d4xw0000gn/T/tmp.QJi93Lpxu7: Operation not permitted
```

Pinning `TMPDIR` in the harness settings does not rescue it, because the command never reads the variable.

The failure is quiet rather than loud, which is what makes the third rule load-bearing. A verification probe following the empty value overwrote `packages/guards/package.json` in `williamthorsen/toolbelt`, wrote two stray files into `packages/guards/src/`, and ran `git init` and `git add -A` inside the working tree: the outcome the disposable-environment doctrine exists to prevent.

## Why the base is re-stated rather than referenced

Two distinct mechanisms, either of which is enough on its own.

A file tool performs no shell expansion. A path containing `$TMPDIR` handed to one is taken literally, so it creates a directory named `$TMPDIR` inside the working directory rather than writing where it meant to.

A shell variable does not outlive the Bash invocation that set it, and `$TMPDIR` itself is not guaranteed stable between invocations. Where the harness settings do not pin it, a sandboxed command and one that `excludedCommands` names resolve different directories, so a file the first writes is not where the second looks. Passing `$TMPDIR/x` to `gh` then fails with "no such file or directory" even where nothing has collided.

## Cleanup

None is required. A session scratchpad is scoped to the session, and a `mktemp` directory under `/tmp` does not survive a reboot.
