Start from this skeleton. Add a section only when it adds signal on which the reader must act.

- **Problem** and **Acceptance criteria (Must have)**: Always present.
- **Context**, **Proposed solution** (including "X, not Y"), and **Should have / Nice to have**: Opt-in, added only when the reader needs them. Omit empty tiers.

This applies the [concision principle](../_data/concision.md) to tickets.

**Write the tightened ticket, not a draft to be tightened later.** A ticket is the minimal contract that a reader needs, not a transcript of the design session. Compose the maximally tight version that still keeps the full meaning; length comes from content, not from a completeness instinct. (Producing the tight version up front spares the reader, and spares everyone the tighten-on-request round trip.)

State conclusions, not the journey to them. Naming a chosen approach (including "X, not Y") is a durable decision and belongs in the ticket. The _story_ of how the decision was reached does not: Drop the design back-and-forth, the false starts, restated context, and motivating episodes.

**Self-check before presenting.** For each sentence, ask: Would removing it change what the reader does or how the work gets executed? If not, cut it. State each acceptance criterion once, and do not restate it in surrounding prose.

Add a design-narrative section (rationale, alternatives explored) only when the user explicitly asks for it.

**Before** (the design journey is left in):

> We first considered extending the existing `FooAdapter`, but a spike showed it couples the cache to the transport, so after some back-and-forth we landed on a separate `CacheLayer`. The team has struggled with cache invalidation before, and this should finally fix that. Acceptance: A new `CacheLayer` module exists. It must be covered by tests so we know it works.

**After** (conclusion only, full meaning intact):

> Add a `CacheLayer` separate from the transport (not an extension of `FooAdapter`, which would couple cache to transport).
>
> - [ ] `CacheLayer` is independent of the transport.
> - [ ] New behavior is covered by tests.

**Place ticket content by kind, not by volume.** A ticket states the change's _subject_ and the _outcomes_ that it must produce; the _mechanism_ that achieves them belongs with the implementation, not the ticket. This is a separate axis from concision: A perfectly short ticket can still contain the wrong _kind_ of content.

- **Ticket**: The change's **subject** (the defect being fixed, the current structure being changed, the target contract or behavior that it exposes) and **key** non-obvious details that save the implementer real derivation (e.g. "reuse the sibling table's `getSortValue`").
- **Implementation**: The **mechanism**, meaning internal wiring, files as a diff-list, step sequences, deletion lists, and the internal props/config of a dependency consumed by the change.

The line is subject vs. mechanism, not code vs. prose: A code name is fine when it _is_ the subject. **Bug and refactoring tickets** name existing code because that code is the subject. Keep it; the fix procedure still belongs with the implementation.

**Before** (a feature ticket transcribing a reference implementation's API surface):

> Set `columnDefs`, pass `getSortedRowModel`, and wire `state.sorting`; pin the first column via `columnPinning.left: ['name']`; mock `@acme/table` in `__mocks__/@acme/table/compiled.tsx`.

**After** (the same change stated as the contract that it must honor):

> Every column sorts client-side, and the first column stays pinned during horizontal scroll. (Which props wire this up is implementation.)
