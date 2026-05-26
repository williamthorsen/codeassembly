Before saving, audit each new or modified comment.

**The deletion test.** For each comment, ask: *would a competent reviewer reading the code lose anything if I deleted this comment?*

- If no, delete it.
- If yes, confirm the kept comment does not violate any deletion rule:
  - Restates or paraphrases the surrounding code.
  - References the conversation, a ticket, or a PR.
  - Documents the library being used.
  - Explains an unreachable case (encode as a type or assertion instead).
  - Duplicates a fact covered elsewhere.
  - Is a tutorial-style file header.
  - Is process commentary (author reasoning, "matches X precedent," "future readers should note…").
  - Leaks domain into shared code.
  - Is a "what" inline comment (rewrite as "why" or delete).

Comments that paraphrase the just-finished design conversation are the most common failure mode in interactive sessions. That material belongs in commit messages or PR descriptions, not source.
