---
name: typescript-conventions
description: TypeScript conventions for projects using TypeScript - type safety, assertions, and best practices
user-invocable: false
---

# TypeScript language mechanics

Rules specific to TypeScript language features, syntax, and type safety.

## Type safety

### Type assertions are banned

**Type assertions are BANNED. No exceptions except those explicitly listed below.**

Type assertions (`as Type`, `<Type>value`) lie to TypeScript about runtime reality. They are the number one source of runtime type errors and bugs.

**Core principle:** If the actual type is `unknown`, return `unknown`. Do not pretend it is something else.

**Banned patterns:**

```typescript
// ❌ BANNED - Lying about types from external data
function readConfig<T>(path: string): T {
  const data = fs.readFileSync(path);
  return JSON.parse(data) as T; // Runtime type is unknown!
}

// ❌ BANNED - Direct type assertions
const config = JSON.parse(data) as Config;
const result = apiResponse as ApiResult;
```

**Required patterns:**

```typescript
// ✅ CORRECT - Return unknown, let caller validate
function readConfig(path: string): unknown {
  const data = fs.readFileSync(path);
  return JSON.parse(data);
}

// ✅ CORRECT - Use proper type guards
function isConfig(value: unknown): value is Config {
  return isObject(value) && typeof value.version === 'string';
}

const parsed: unknown = JSON.parse(data);
if (!isConfig(parsed)) {
  throw new Error('Invalid config');
}
// Now parsed is properly typed as Config
```

**The ONLY exceptions** (must have detailed comment explaining why):

1. **TypeScript limitation workarounds** - Small utility functions where the type is genuinely guaranteed but TypeScript cannot infer it (e.g., `Object.keys()`). Must include comment.

2. **Test code** - Type safety may be relaxed where proper typing would unnecessarily complicate tests of external APIs.

### Additional type safety rules

**NEVER write unsafe code:**

- NEVER use `any` type
- NEVER use non-null assertions without detailed justification
- NEVER promise type guarantees through generic parameters you cannot deliver
- ALWAYS return `unknown` when you cannot guarantee the actual type
- ALWAYS use proper type guards and runtime validation

**Safe alternatives:**

- `unknown` for arbitrary data requiring type guards
- Proper generic types only when you can guarantee the type at runtime
- Union types for known variants
- Runtime validation with type guards or libraries like Zod

### Type preferences

- **Prefer `undefined` over `null`** unless serialization requires it
- **Never use type assertions** - JSON.parse is always unsafe
- **Always properly type or use `unknown`** instead of `any`

## Code structure

### Functions

Prefer function declarations to function expressions, unless the variable is typed:

```tsx
// ❌ Incorrect
const myFunction = () => {
  /* ... */
};

// ✅ Correct
function myFunction() {
  /* ... */
}

// ✅ Correct - Variable has type annotation
const MyComponent: React.FC = () => {
  /* ... */
};
```

### Type organization

Keep TypeScript types in the same file as their sole provider (component or function). This enables single imports: `import { Component, type ComponentProps } from './Component'`

**Exception:** Only extract types to shared `types.ts` when multiple providers genuinely need the same type.
