**Indent a nested list item 4 spaces.** Bitbucket Cloud reads a 2-space indent as a sibling of its parent rather than a child, and reports nothing: The list flattens, and the only way to notice is to view the published text. GitHub accepts either width, so 4 spaces renders as intended on both.

```
- parent
    - child
        - grandchild
```

This rule governs text composed for a rendering surface: a pull-request description, a merge-commit body, a comment. It does not govern Markdown inside the repository, where the formatter in use sets the indent: Prettier normalizes a nested item to its parent's content column.
