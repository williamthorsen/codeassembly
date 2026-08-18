**Place ticket content by kind, not by volume.** A ticket states the change's _subject_ and the _outcomes_ it must produce; the _mechanism_ that achieves them belongs with the implementation, not the ticket. This is a separate axis from concision — a perfectly short ticket can still contain the wrong _kind_ of content.

- **Ticket** — the change's **subject** (the defect being fixed, the current structure being changed, the target contract or behavior it exposes) and **key** non-obvious details that save the implementer real derivation (e.g. "reuse the sibling table's `getSortValue`").
- **Implementation** — the **mechanism**: internal wiring, files as a diff-list, step sequences, deletion lists, and the internal props/config of a dependency the change consumes.

The line is subject vs. mechanism, not code vs. prose: A code name is fine when it _is_ the subject. **Bug and refactoring tickets** name existing code because that code is the subject — keep it; the fix procedure still belongs with the implementation.

**Before** — a feature ticket transcribing a reference implementation's API surface:

> Set `columnDefs`, pass `getSortedRowModel`, and wire `state.sorting`; pin the first column via `columnPinning.left: ['name']`; mock `@acme/table` in `__mocks__/@acme/table/compiled.tsx`.

**After** — the same change stated as the contract it must honor:

> Every column sorts client-side, and the first column stays pinned during horizontal scroll. (Which props wire this up is implementation.)
