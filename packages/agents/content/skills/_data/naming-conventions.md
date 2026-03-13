# Naming conventions

## No abbreviations

Use full words. Abbreviations save keystrokes but cost comprehension.

- ✅ `position`, `request`, `response`, `configuration`, `message`
- ❌ `pos`, `req`, `res`, `config`, `msg`

**Exception:** trivial predicate callbacks where the variable is used once and the type is obvious: `.map(c => c.trim())`, `.filter(n => n > 0)`.

## Unit-of-measure suffixes

Numeric variables must include the unit as a suffix. Abbreviations are fine when clearly understandable.

- ✅ `durationMs`, `timeoutMs`, `delaySec`, `CELL_HEIGHT_PX`, `fontSizeRem`
- ❌ `duration`, `timeout`, `delay`, `CELL_HEIGHT`, `fontSize`

## Verb-led function names

Functions start with a transitive verb that describes the action.

- ✅ `fetchResults`, `buildPayload`, `resolveColor`, `parseCommitTitle`
- ❌ `results`, `payload`, `color`, `commitTitle`

Common verbs: `build`, `create`, `compute`, `fetch`, `find`, `get`, `load`, `parse`, `resolve`, `validate`.

## Boolean naming

Booleans start with `is`, `has`, `should`, or `does` (with conjugations: `was`, `are`, `have`, `did`).

- ✅ `isVisible`, `hasChildren`, `shouldRetry`, `doesExist`, `wasProcessed`
- ❌ `visible`, `children`, `retry`, `exists`, `processed`
