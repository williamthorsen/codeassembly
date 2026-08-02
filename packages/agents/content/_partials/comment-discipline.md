## Comment discipline

Every comment you write **into source** is governed here — writing new code, revising it, editing after a review, or **proposing** replacement comment text inside a review finding. A comment drafted for someone else's file is a source comment and takes the same audit.

The reader is an engineer six months from now with no transcript, no session, and no memory of the change. Write for that reader.

### The baseline

Every non-trivial function, method, class, and component carries a description of what it does. One line usually carries it; a contract with genuinely separable parts earns more. Trivial code — a getter, a one-line helper whose name says it all — needs none. The baseline is a floor, not a licence to pad above it.

A function, method, or component description leads with a verb; any other opening is a defect, whether a verbless noun phrase ("Construction of the payload shape"), a subject ("This helper builds the payload"), or a participle ("Used to build the payload"). Existing descriptions that open otherwise are drift, not local standard. A type, interface, or constant description may be a noun phrase, since it names a thing rather than an action. The description states what the declaration does and, where it returns a value, what it returns and under what condition that varies, staying within what the declaration itself can see. The verb's mood is a project preference and is not set here.

### Three tests

Apply all three to every comment you write or keep. A comment that fails one is cut, not softened. Comments are code: read, maintained, and trusted. Every line pays rent.

**1. The stranger test — would this interest only someone who watched the change happen?** Then cut it.

Tells: _rather than_, _instead of_, _deliberately_, _used to_, _previously_, _replaces_, _we discussed_, _as agreed_, _see PR #N_, _added by TICKET-123_, _matches the X precedent_, _future readers should note_. So is any defense of the edit, any counterfactual whose other branch was never possible, and any narration of how or where the code is run.

State the code as it **is**, in the present tense — never as it was, as it might have been, or as it is not.

**2. The deletion test — would a reader lose anything if the comment were gone?** Then cut it.

A comment that paraphrases the line below it, restates the test's own name, or re-describes what a well-named function it calls already documents carries nothing. Inline comments answer _why_, never _what_. One line by default; exceed it only when a genuinely multi-part constraint will not compress.

**3. The one-location test — is this fact already documented where it belongs?** Then cut it.

The library's behavior belongs in the library's docs. A helper's contract belongs on the helper. A consumer's name belongs nowhere near the shared code it consumes. An invariant belongs in a type or an assertion, not in prose about a case that cannot happen.

### Carve-outs

These survive the tests. They are permissions, not requirements.

- **Test comments** — non-obvious setup the test name does not convey; an indirect assertion, naming the reason for the indirection; the rationale for a skip.
- **`eslint-disable` rationales** — why _this_ rule is suppressed _here_, and nothing more: `// eslint-disable-next-line no-explicit-any -- third-party Stripe type ships as any.` The carve-out governs the comment, not the suppression; whether to suppress at all is an `anti-patterns` question.

### Before and after

**Written for the reviewer** — fails the stranger test. The comment defends the edit and describes what the code is _not_.

Before:

```ts
// `stdout` is deliberately absent: nothing here reads a captured stdout, so the type does not offer one.
// Returns null rather than a false pass.
```

After:

```ts
// `spawnSync` returns null for a stream redirected to a file descriptor; `runAttw` reads the output back from the file.
```

**Restating the call below it** — fails the deletion test. The helper's own contract, re-narrated at the call site.

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

**Proposed inside a review finding** — a suggested replacement comment is a source comment. This one restates the lookup the code already expresses and copies an example ID out of the source.

Before:

> Looks up the employee by id (e.g. `EMP034`) through the `employees` search query, then maps each row to a `CompRow`.

After:

> todo: Update stale doc comment — the header still describes the lookup as "via the `employees` search query", which this change replaces.
