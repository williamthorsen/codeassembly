---
slug: ui-copy-conventions
description: 'Text in a product surface: written for the person who returns to the page, with rules for labels, helper text, errors, and empty states, and a copy budget. Consult before writing labels, helper text, messages, or empty states for a page, a prototype, or a UI component.'
delivery: [skill]
version: '1'
---

# UI copy conventions

A tool page is written for the person who uses it every week, not for a first-time visitor. Copy that introduces the page, sells it, or walks through it is text that this person reads past on every visit, and a sentence that declares the task finished decides something that is theirs to decide. These conventions apply to a prototype or a mockup exactly as they apply to a shipped interface.

When a project names its own content guidelines, such as a design system's, those guidelines take precedence where the two conflict.

## Rules

- **Labels** are nouns. **Buttons** are verbs that name the action that they perform.
- **Helper text** states a constraint or a consequence: the format that a field accepts, or what an action changes.
- **An error** names the problem and the fix.
- **Register.** A sentence never explains the page, reassures, congratulates, or narrates the reader ("you are done", "you can…").
- **Minimizers.** Leave out "simply" and "just".
- **Case.** Labels, buttons, headings, and messages take sentence case.

## Copy budget

- A page does not open with an intro paragraph.
- A control has at most one line of helper text.
- An empty state has one line.

## Example

Under the heading of an API-token page:

- ❌ "Make a token from a preset or one of your sets, give it a name, and you are done."
- ✅ Nothing under the heading. Under the name field: "Shown in the token list. Not secret."
