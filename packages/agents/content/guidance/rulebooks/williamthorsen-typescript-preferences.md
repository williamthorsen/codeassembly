---
slug: williamthorsen-typescript-preferences
description: 'TypeScript language mechanics, module shape, and documentation form: type safety, exports and barrels, import specifiers, type placement, and doc tags. Consult before writing or modifying TypeScript.'
delivery: [hook, skill]
version: 3
---

# William Thorsen's TypeScript preferences

TypeScript language mechanics, the shape of a module's public surface, and documentation form.

## Exports

Export by name. Never use a default export: Importers invent their own names, and renames never propagate.

## Barrels

A barrel (an `index.ts` that re-exports a directory's modules) is permitted only at a package's published entry point: a module named in the package's `exports` map, whether the root entry or a subpath. Everywhere else, an import names the defining module directly.

Importing one symbol through a barrel loads every module the barrel re-exports.

A barrel is also permitted at a vendor boundary that lint enforces: A directory containing the sole permitted import site for an external dependency is a module boundary in the same sense as a package entry point. The permission rests on the enforcement, so a boundary no lint rule protects gets no barrel.

## Import specifiers

Write the specifier that names the file on disk: `./parse-note.ts`, not `./parse-note.js`.

This requires `allowImportingTsExtensions` and a build that rewrites extensions in output and declarations. Without both, use the `.js` form.

## Type safety

Never use a type assertion (`as Type`, `<Type>value`): It claims a runtime guarantee the code cannot make. Where the type is not guaranteed, return `unknown` and let the caller narrow it with a type guard.

```typescript
// ❌ Claims a type nothing verified
function readConfig<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as T;
}

// ✅ Returns what it knows; the caller narrows
function readConfig(path: string): unknown {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function isConfig(value: unknown): value is Config {
  return isObject(value) && typeof value.version === 'string';
}
```

Two exceptions, each with a comment saying why: a TypeScript limitation where the type is guaranteed but uninferable, such as `Object.keys()`; and test code, where precise typing of an external API would obscure the test.

Never use `any`, a non-null assertion (use a runtime assertion instead), or a generic parameter that claims a guarantee the function cannot deliver. Model known variants as a union, and validate external data with a type guard or a schema library.

Prefer `undefined` to `null` unless serialization requires otherwise.

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

Omit `@param`, `@returns`, and other tags; if a parameter has a constraint that its name and type cannot express -- such as a valid range, a precondition, or mutual incompatibility with another parameter -- describe the constraint in the description.

This prohibition against `@` tags does not apply to

- symbols exported from a package's published entry point
- custom tags such as `@internal` and `@stage`
