**Write the tightened ticket, not a draft to be tightened later.** A ticket is the minimal contract a reader needs, not a transcript of the design session. Compose the maximally tight version that still keeps the full meaning; length comes from content, not from a completeness instinct. (Producing the tight version up front spares the reader, and spares everyone the tighten-on-request round trip.)

State conclusions, not the journey to them. Naming a chosen approach (including "X, not Y") is a durable decision and belongs in the ticket. The _story_ of how the decision was reached does not: Drop the design back-and-forth, the false starts, restated context, and motivating episodes.

**Self-check before presenting.** For each sentence, ask: Would removing it change what the reader does or how the work gets executed? If not, cut it. State each acceptance criterion once: no restatement in surrounding prose.

Add a design-narrative section (rationale, alternatives explored) only when the user explicitly asks for it.

**Before** (the design journey is left in):

> We first considered extending the existing `FooAdapter`, but a spike showed it couples the cache to the transport, so after some back-and-forth we landed on a separate `CacheLayer`. The team has struggled with cache invalidation before, and this should finally fix that. Acceptance: A new `CacheLayer` module exists. It must be covered by tests so we know it works.

**After** (conclusion only, full meaning intact):

> Add a `CacheLayer` separate from the transport (not an extension of `FooAdapter`, which would couple cache to transport).
>
> - [ ] `CacheLayer` is independent of the transport.
> - [ ] New behavior is covered by tests.
