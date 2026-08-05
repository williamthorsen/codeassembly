# Naming conventions

## No abbreviations

Use full words. Abbreviations save keystrokes but cost comprehension.

- ✅ `position`, `request`, `response`, `configuration`, `message`
- ❌ `pos`, `req`, `res`, `config`, `msg`

**Exception:** trivial predicate callbacks where the variable is used once and the type is obvious: `.map(c => c.trim())`, `.filter(n => n > 0)`.

## Kind in the tail

A name that holds a value ends with what the value is; qualifiers go in front.

- ✅ `visitedNodes`, `selectedItems`, `expectedValue`, `aInteger`, `bInteger`
- ❌ `visited`, `selected`, `expected`, `integerA`, `integerB`

Booleans are the exception: a claim has no kind to name.

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

Prefix a boolean with `is`, `has`, `should`, or `does` (with conjugations: `was`, `are`, `have`, `did`) when the bare name could plausibly hold a non-boolean value. Under the tail rule above that reduces to one check: a noun or a verb takes the prefix, because bare it names a thing or an action; an adjective or a past participle does not, because a value would have carried its kind. Where a word reads both ways, predicative use decides: `empty` and `quiet` fit `is ___`, while `default` and `success` take an article.

A finite verb takes the prefix for a second reason: this file reserves verb-led names for functions, so bare `exists` reads as a call. A past participle raises no such collision.

- ✅ `visible`, `processed`, `passed`, `quiet`, `verbose`, `empty`
- ❌ `children`, `default`, `retry`, `exists` — a collection, a value, a policy, a function; take `hasChildren`, `isDefault`, `shouldRetry`, `doesExist`

Public and wire surfaces carry the bare form where it passes: `ok`, `passed`.
