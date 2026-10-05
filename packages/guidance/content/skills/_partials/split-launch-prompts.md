**Launch prompts.** Present one launch prompt for each ticket that keeps work, ready to paste into a fresh session: With two pieces, the originating ticket gets one; an umbrella does not get one. Order the prompts by work order: A ticket comes after every ticket that blocks it, and otherwise in the order in which it was created. Render each prompt as a bold heading line, `**{ticket_ref}: {title}** (ready now)` or `(after {blocker_ref} merges)`, followed by a fenced block that contains only the text to paste:

- The entry invocation, which the rule above chooses, as `{entry_skill} with plan: {plan_path}, ticket: {ticket_ref}`, adding any flag that the rule names, and omitting the plan when the ticket does not have one.
- The scope notes that the session needs and that the artifacts do not state, such as "only tasks 2 and 3" or "merge only after `live` contains #N".
- The ticket's blockers, by reference.
