# Naming conventions

## No obscure abbreviations

An abbreviation is permitted when it is what practitioners call the thing, aloud and in prose, so that a reader recognizes it without expanding it. One that the reader must expand is banned, and ambiguity is the usual symptom: `res` names a result, a response, or a resource.

- ✅ `config`, `dir`, `args`, `spec`, `ref`, `repo`, `env`, `id`
- ❌ `req`, `res`, `pos`, `msg`, `ctx`, `num`, `str`

When the full word is a reserved word of the language, its accepted abbreviation is permitted: `fn` for `function`.

A permitted abbreviation is not required: Code may spell the word out to stay consistent with its surroundings.

**Exception:** Trivial predicate callbacks in which the variable is used once and the type is obvious: `.map(c => c.trim())`, `.filter(n => n > 0)`.

## Kind in the tail

A name for a value ends with what the value is; qualifiers go in front.

- ✅ `visitedNodes`, `selectedItems`, `expectedValue`, `aInteger`, `bInteger`
- ❌ `visited`, `selected`, `expected`, `integerA`, `integerB`

Booleans are the exception: A claim has no kind to name.

## Unit-of-measure suffixes

Numeric variables must include the unit as a suffix. `Ms`, `Sec`, `Px`, and `Rem` pass the abbreviation test above.

- ✅ `durationMs`, `timeoutMs`, `delaySec`, `CELL_HEIGHT_PX`, `fontSizeRem`
- ❌ `duration`, `timeout`, `delay`, `CELL_HEIGHT`, `fontSize`

## Verb-led function names

Functions start with a transitive verb that describes the action.

- ✅ `fetchResults`, `buildPayload`, `resolveColor`, `parseCommitTitle`
- ❌ `results`, `payload`, `color`, `commitTitle`

Common verbs: `build`, `create`, `compute`, `fetch`, `find`, `get`, `load`, `parse`, `resolve`, `validate`.

## Boolean naming

Prefix a boolean with `is`, `has`, `should`, or `does` (with conjugations: `was`, `are`, `have`, `did`) when the bare name could plausibly name a non-boolean value. Under the tail rule above, that reduces to one check: A noun or a verb takes the prefix, because the bare word names a thing or an action; an adjective or a past participle does not, because a non-boolean value's name would already state its kind. When a word reads both ways, predicative use decides: `empty` and `quiet` fit `is ___`, while `default` and `success` take an article.

A finite verb takes the prefix for a second reason: This file reserves verb-led names for functions, so bare `exists` reads as a call. A past participle causes no such collision.

- ✅ `visible`, `processed`, `passed`, `quiet`, `verbose`, `empty`
- ❌ `children`, `default`, `retry`, `exists`: A collection, a value, a policy, a function; take `hasChildren`, `isDefault`, `shouldRetry`, `doesExist`

Public and wire surfaces use the bare form when it passes: `ok`, `passed`.
