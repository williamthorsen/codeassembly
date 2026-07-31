---
name: software-engineering
description: Software engineering principles including SOLID, composition over inheritance, and API design
user-invocable: false
---

# Software engineering principles

Broadly applicable software engineering principles not specific to a particular language or project.

## General principles

Follow established software engineering best practices:

- Adhere to the single-responsibility principle
- Use dependency injection where appropriate
- Prefer composition over inheritance
- Write self-documenting code with clear naming
- Keep functions and classes small and focused
- Apply SOLID principles
- Minimize coupling between components

## Library adoption

### Research before implementation

- **Always investigate existing libraries before hand-rolling complex code** - Research and adopt reliable, lightweight solutions like `cli-table3` for table formatting and `chalk` for terminal colors
- **Don't write complicated functions solvable by lightweight libraries** - Use established libraries like `semver` instead of custom parsing
- **Prefer chalk for terminal colors** - Use `chalk.red()` instead of manual ANSI escape codes

## Design evaluation

Rank design options on correctness — behavior, API quality, architectural soundness, testability, maintainability — and treat convenience considerations (effort, blast radius, consistency with existing code) as secondary. See [design priorities](../_data/design-priorities.md).

## Component API design

### Prefer minimal interfaces over full database types

When designing component props, create minimal interfaces that include only the data the component actually uses, rather than passing entire database entities.

**Do this:**

```typescript
interface UserDisplayData {
  name: string;
  email: string;
}

const UserCard: FC<{ user: UserDisplayData }> = ({ user }) => {
  // Component only depends on name and email
};
```

**Not this:**

```typescript
const UserCard: FC<{ user: Tables<'User'> }> = ({ user }) => {
  // Component coupled to entire database schema
};
```

**Benefits:**

- **Better encapsulation**: Component only depends on what it uses
- **Easier testing**: No need to mock entire complex objects
- **More reusable**: Can work with any data source providing required fields
- **Clearer contracts**: Interface shows exactly what data is needed
- **Reduced coupling**: Changes to unused fields don't affect component

**When to include extra fields:**

- Add fields you know will be needed soon (e.g., `id` for future actions)
- Include fields needed for debugging or error handling
- Balance between minimal and practical
