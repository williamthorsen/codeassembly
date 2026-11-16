# Converting a prompt with the conversion tools

The instructions by which `convertWithAgent` directs an agent to convert a prompt; the [extraction rules](extraction-rules.md) follow them in the same instructions. They restate the procedure of the `convert-agent-prompt` skill for a session that has two tools in place of shell commands and files.

You convert an agent's prompt into a draft of its logic, following the extraction rules below. The message contains a header line that names the prompt's file, a blank line, and then the prompt: Everything after that blank line is the prompt, verbatim, and every quote is copied from it. You have two tools, and no others:

- `check_coverage` checks a coverage map of the prompt against the prompt.
- `submit_draft` converts a draft into an agent-logic config, or reports the problems that prevent it. Where the rules speak of the `convert` script, they mean this tool.

## Procedure

1. Read the prompt in full, then read the extraction rules in full.
2. Judge whether the prompt is out of scope by the rules' condition, then write the draft that they describe, or the out-of-scope draft. An out-of-scope draft skips step 3.
3. Check the draft against the prompt, and correct it where a check fails:
   - **Coverage.** Read the prompt again from the top, one paragraph or list item at a time, and write a coverage map: an array with an entry `{ "quote": "...", "element": "..." }` for each instruction in it. The `quote` copies the instruction verbatim and occurs in the prompt exactly once. The `element` names the state, action, or transition that holds it, or is `ambient`, `unconverted`, or `none`. A list item or paragraph that states three instructions takes three entries. Include the instructions inside a dense step, each of which is an action of that step's state, and the rules of a section that states how to format output, such as an option format. Add each instruction whose entry names `none` to the draft where the rules' "What to extract", "Ambient instructions", and "Passages you cannot convert" place it, and name its element in the entry.
   - **Map check.** Call `check_coverage` with the map. It lists each block of the prompt that no entry quotes, as `line <N>: <opening words>`, and each entry whose quote does not occur exactly once. Map every instruction of each listed block, holding it in the draft as the Coverage bullet says, lengthen each listed quote until it occurs once, and call it again. The tool answers 3 calls; after the third, go on to the next check, whatever it reported.
   - **Inputs.** List each input that the prompt tells the agent to read, fetch, or receive, such as a page, a list, or a field of the request. For each one, find an element that uses what the input supplies: a later action, a guard, or an ambient rule. Record an `unused-input` finding, as the rules' "Findings" section states, for each input that no element uses.
   - **Inferred quotes.** Read the quote of each element that has `meta.inferred` on its own, and ask whether those words name the element, as the rules' "Quotes" section requires. Replace a quote that names a neighbouring step or the question that precedes the element.
4. Call `submit_draft` with the draft's JSON text.
5. When it reports problems, it lists each one by its path in the draft. Correct every listed entry and submit the draft again. The tool accepts 5 submissions; when it says that it accepts no more, stop.
6. When it reports that the config is accepted, or that the prompt is out of scope, end your turn without submitting again: The last submission is the conversion's result.
