---
slug: williamthorsen-typescript-preferences
description: TypeScript language mechanics, module shape, and documentation form -- type safety, exports and barrels, import specifiers, type placement, and doc tags. Consult before writing or modifying TypeScript.
delivery: skill
version: 1
---

# William Thorsen's TypeScript preferences

TypeScript language mechanics, the shape of a module's public surface, and documentation form.

Where files and directories go, and what they are called, lives in a companion rulebook, invoked as {rulebook:williamthorsen-code-layout-preferences}.

## Exports

Export by name. Never use a default export: a default has no name at the definition site, so every importer is free to invent a different one, and no rename ever propagates.

## Barrels

A barrel -- an `index.ts` that re-exports a directory's modules -- is permitted only at a package's published entry point: a module named in the package's `exports` map, whether the root entry or a subpath. Everywhere else, an import reaches the defining module directly.

A barrel makes a package's public surface explicit, which is worth having at the boundary. Inside the package it buys nothing and costs on every consumer: importing one symbol loads every module the barrel touches, which inflates test startup as much as it inflates a bundle. Biome files its barrel rules under `performance` for that reason, and Next.js added `optimizePackageImports` specifically to undo the cost for third-party barrels it cannot control. Nothing undoes it for your own.

## Import specifiers

Write the specifier that names the file on disk: `./parse-note.ts`, not `./parse-note.js`.

The `.js` form is what `moduleResolution: NodeNext` requires when nothing rewrites extensions, since it resolves against emitted output. Where a build rewrites them -- and where `allowImportingTsExtensions` is set -- the `.js` specifier names a file that does not exist in source, and every reader has to know the convention to follow the import.

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
- NEVER use non-null assertions; use real runtime assertions
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

## Functions

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

## Type placement

Keep types in the same file as their sole provider (component or function). This enables single imports: `import { Component, type ComponentProps } from './Component'`

**Exception:** Only extract types to shared `types.ts` when multiple providers genuinely need the same type.

## Documentation

Omit `@param` and `@returns`. The signature already carries the parameter names, their types, and the return type, and a description that restates them adds a second place to go stale. A constraint no name or type can express -- a valid range, a precondition, two parameters that cannot both be set -- belongs in the description, which can state a relationship across parameters that a per-parameter tag fragments.

The one exception is a symbol exported from a package's published entry point, where a consumer reads the emitted declarations rather than the source and their editor surfaces per-parameter text. That is the same boundary the barrel rule uses, so it is checkable from the file's path.

The exception depends on the emitted declarations carrying comments at all. A project compiling with `removeComments` strips them from its `.d.ts` output, and every tag written under this exception reaches nobody.

Descriptions themselves -- what earns one, and what a comment may say -- are governed by comment discipline, not here.
