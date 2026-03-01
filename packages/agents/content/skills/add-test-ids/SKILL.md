---
name: add-test-ids
description: Add data-test-id attributes to new and modified React components
user-invocable: true
---

# Add test IDs

Add `data-test-id` attributes to components in files you're working on.

## Rules

- Add to all components declared in current task scope
- Do not change existing `data-test-id` values
- Do not add to components that don't support the attribute

## Format

Convert component name to kebab-case:

- `HelpPanel` → `data-test-id="help-panel"`
- `UserProfileCard` → `data-test-id="user-profile-card"`
- `NavigationMenu` → `data-test-id="navigation-menu"`

## Example

```tsx
// Before
export const HelpPanel: FC<Props> = ({ title, children }) => {
  return (
    <div className="help-panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
};

// After
export const HelpPanel: FC<Props> = ({ title, children }) => {
  return (
    <div className="help-panel" data-test-id="help-panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
};
```

## Placement

Add `data-test-id` to the root element of the component.
