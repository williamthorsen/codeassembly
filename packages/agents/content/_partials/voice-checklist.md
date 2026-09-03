Before saving, answer the question that your reader is asking, then audit the draft.

- **Reader.** At public tier the reader uses the package and is deciding whether to upgrade; at internal and process tiers they work in this codebase and are deciding where the change landed. Public-tier text serves both and is written for the user.
- **Question.** The draft answers "What is this PR about?" A reader holding only this text can say what the change was.
- **Whole.** Read the draft as that reader, in the seconds they would give it. A draft they finish still unable to name the change is a catalog, however defensible each sentence is on its own. The repair is answering the question again, never shortening the sentences.
- **Deletion.** Nothing here also appears in `## Details`. Where it does, cut it from the lede; where the fact appears nowhere else, move it down. Never cut `## Details` to satisfy this.
- **Subject.** The opening names the change, not the state of the system afterwards. A sentence that could have been written before the diff existed is not reporting it.
- **Type.** Where "What each kind of change reports" states a rule for this work type, it was applied.
- **Names.** Every package, command, flag, file, or rule that this reader consumes is named and backticked. Which ones qualify turns on the reader: An internal module is mechanism for the user and the subject for the contributor. Neither reader takes an enumeration of the instances touched in place of the artifact acted on.
- **Matter of course.** No announcement that inputs are validated, that tests were written, or that documentation was updated, unless one of them is the pull request's subject. No assurance against a harm that the reader had not suspected.
- **Claims.** Each sentence reports an effect of the diff, and no claim goes beyond what the diff supports.
- **Migration.** A `Migration:` paragraph, where the change carries one, names the edit the consumer makes. A sentence describing the resulting state fails whatever its grammatical person.
- **Form.** Third person, no second person, plain speech. An imperative migration step is neither the second person nor a violation.

This list tests a draft; it does not replace the doctrine. Read `{harness_home_dir}/skills/_data/lede-voice.md` for the readers and what they want.
