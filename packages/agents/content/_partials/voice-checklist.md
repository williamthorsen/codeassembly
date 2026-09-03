Before saving, answer the question that your reader is asking, then audit the draft against the doctrine.

- **Question.** At public tier, what does the product now do? At internal and process tiers, what was done to the code?
- **Altitude.** Every sentence is at the accomplishment level. A finding established during the work, a count of instances touched, an internal causal chain, and the before-and-after syntax of an edit belong below it. Then test each clause: Would the reader's next move -- such as clicking into the details or using the product -- change if it were absent? A clause that the decision does not turn on is padding.
- **Deletion.** Nothing here also appears in `## Details`. Where it does, cut it from the lede; where the fact appears nowhere else, move it down.
- **Subject.** The opening names the change, not the state of the system afterwards. A sentence that could have been written before the diff existed is not reporting it.
- **Type.** The per-type section for this work type was applied -- for `perf`, `sec`, `deprecate`, and `ci`, the host section named there.
- **Names.** Every package, command, flag, file, or rule consumed by the reader is named and backticked. An identifier that they never consume is mechanism, and naming it does not make it admissible.
- **Claims.** Each sentence reports an effect of the diff, and no claim goes beyond what the diff supports.
- **Migration.** A `Migration:` paragraph, where the change carries one, names the edit the consumer makes. A sentence describing the resulting state fails whatever its grammatical person.
- **Cuts.** No empty contrast, no assurance against an unsuspected harm, no process narration, no second person. An imperative migration step is neither the second person nor a cut.

This list tests a draft; it does not replace the doctrine. Read `{harness_home_dir}/skills/_data/lede-voice.md` in full before drafting.
