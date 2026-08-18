## Comment discipline

These rules apply to every comment you write **into source**: writing new code, revising it, editing after a review, or **proposing** replacement comment text inside a review finding. A comment drafted for someone else's file is a source comment, and the same audit applies to it.

The reader is an engineer six months from now with no transcript, no session, and no memory of the change. Write for that reader.

### The baseline

Every function, method, class, and component **must** have a description. One line is often enough. Exceed that length only when a reader would be substantially helped by a longer explanation (and don't include anything readily apparent from a quick glance at the code). If in doubt, be terse. 

The description of a function or method describes what it **does** and leads with a verb; any other opening is nonstandard and should not be emulated. The verb's mood is a project preference and is not set here.

The description of a class or component describes what it **is**.

Add descriptions of constants only if the description helps a reader understand the code. Load-bearing constants are good candidates for description. Most other constants are not; rely on good variable names instead. Do not describe an interface or type unless its purpose is nonobvious. 

### Three tests

Apply all three to every comment you write or keep. A comment that fails one is cut, not softened. Comments are code: read, maintained, and trusted. Each one must justify its place.

**1. The stranger test — would this interest only someone who watched the change happen?** Then cut it.

Tells: _rather than_, _instead of_, _deliberately_, _used to_, _previously_, _replaces_, _we discussed_, _as agreed_, _see PR #N_, _added by TICKET-123_, _matches the X precedent_, _future readers should note_. So is any defense of the edit, any counterfactual whose other branch was never possible, and any narration of how or where the code is run.

State the code as it **is**, in the present tense — never as it was, as it might have been, or as it is not.

**2. The deletion test — would a reader lose anything if the comment were gone?** Then cut it.

A comment that paraphrases the line below it, restates the test's own name, or re-describes what a well-named function it calls already documents tells the reader nothing. Inline comments answer _why_, never _what_. One line by default; exceed it only when a genuinely multi-part constraint will not compress.

**3. The one-location test — is this fact already documented where it belongs?** Then cut it.

The library's behavior belongs in the library's docs. A helper's contract belongs on the helper. A consumer's name belongs nowhere near the shared code it consumes. An invariant belongs in a type or an assertion, not in prose about a case that cannot happen.

### Carve-outs

These pass the tests. They are permissions, not requirements.

- **Test comments**: Non-obvious setup the test name does not convey; an indirect assertion, naming the reason for the indirection; the rationale for a skip.
- **`eslint-disable` rationales**: Why _this_ rule is suppressed _here_, and nothing more: `// eslint-disable-next-line no-explicit-any -- third-party Stripe type ships as any.` The carve-out applies to the comment, not to the suppression; whether to suppress at all is an `anti-patterns` question.

### Before and after

**Written for the reviewer**: Fails the stranger test. The comment defends the edit and describes what the code is _not_.

Before:

```ts
// `stdout` is deliberately absent: nothing here reads a captured stdout, so the type does not offer one.
// Returns null rather than a false pass.
```

After:

```ts
// `spawnSync` returns null for a stream redirected to a file descriptor; `runAttw` reads the output back from the file.
```

**Restating the call below it**: Fails the deletion test. The helper's own contract, re-narrated at the call site.

Before:

```ts
// Builds the document title from the page title and employee name, dropping empties and falling back to the app name.
useDocumentTitle(buildDocumentTitle(EMPLOYEE_COMP_TITLE, data.employee.name));
```

After:

```ts
// Overrides the route wrapper's static title once the name is available.
useDocumentTitle(buildDocumentTitle(EMPLOYEE_COMP_TITLE, data.employee.name));
```

**Proposed inside a review finding**: A suggested replacement comment is a source comment. This one restates the lookup the code already expresses and copies an example ID out of the source.

Before:

> Looks up the employee by id (e.g. `EMP034`) through the `employees` search query, then maps each row to a `CompRow`.

After:

> todo: Update stale doc comment — the header still describes the lookup as "via the `employees` search query", which this change replaces.
