---
name: typescript-testing-conventions
description: TypeScript testing patterns with proper assertions and type narrowing for Jest-based projects
user-invocable: false
---

# TypeScript testing rules

Rules for writing robust, maintainable tests in TypeScript projects.

## Test structure

### Never use conditional expect statements

**❌ Incorrect - Conditional expects**

```typescript
it('should handle optional values', () => {
  const result = someFunction();

  if (result) {
    expect(result.value).toBe('expected');
    expect(result.status).toBe('success');
  }
});
```

**✅ Correct - Use runtime assertions**

```typescript
import { assert } from '~src/utils/types/type-guards';

it('should handle optional values', () => {
  const result = someFunction();

  assert(result, 'Function should return a result');
  expect(result.value).toBe('expected');
  expect(result.status).toBe('success');
});
```

### Why conditional expects are problematic

1. **Silent failures**: If condition is false, no assertions run and test passes incorrectly
2. **Unclear intent**: Ambiguous whether condition failing should pass or fail
3. **Reduced coverage**: Conditional paths may not be tested consistently
4. **Debugging difficulty**: Hard to determine why a test passed when it should have failed

### Use runtime assertions for type narrowing

**✅ Preferred patterns**

```typescript
// For nullable values
assert(value !== null, 'Value should not be null');
expect(value.property).toBe('expected');

// For optional properties
assert(obj.optionalProp, 'Optional property should be defined');
expect(obj.optionalProp.nested).toBe('value');

// For array length
assert(array.length > 0, 'Array should not be empty');
expect(array[0]).toBe('first item');
```

## Test reliability

### Every test should have deterministic assertions

- Each test should always run the same number of assertions
- Use `assert()` or similar runtime guards to ensure preconditions
- Fail fast with clear error messages when preconditions aren't met

### Prefer explicit failure over silent success

```typescript
// ❌ May silently pass if array is empty
if (results.length > 0) {
  expect(results[0]).toBe('expected');
}

// ✅ Explicitly fails if array is empty
assert(results.length > 0, 'Results array should not be empty');
expect(results[0]).toBe('expected');
```

## Type safety in tests

- Import and use project-specific assertion utilities
- Leverage TypeScript's type narrowing after assertions
- Ensure tests fail clearly when type assumptions are violated

```typescript
import { assert, assertIsNonNullable } from '~src/utils/types/type-guards';

it('processes user data correctly', () => {
  const user = getUserData();

  assertIsNonNullable(user, 'User data should be available');
  // TypeScript now knows user is non-null
  expect(user.name).toBe('John Doe');
});
```
