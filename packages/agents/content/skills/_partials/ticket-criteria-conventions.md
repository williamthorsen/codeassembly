**Test criterion convention:** When a ticket involves code changes to testable behavior, the acceptance criteria must include a test criterion (e.g., "New/modified behavior in this change is covered by tests"). Omit the test criterion only when the change falls entirely within the carve-outs defined in the `testing-conventions` skill.

**Documentation criterion convention:** When a ticket involves changes that add, remove, or rename user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), the acceptance criteria must include corresponding updates to documentation, help text, and usage examples, including removal of references to anything that no longer exists.

**Umbrella criterion convention:** An umbrella ticket, whose children do the work, lists "Every child is closed" as an acceptance criterion alongside any requirement of its own, so what completes it is stated rather than inferred.
