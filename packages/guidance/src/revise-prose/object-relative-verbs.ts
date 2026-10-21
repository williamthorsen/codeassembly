/**
 * Verbs whose bare form doesn't have any verbal morphology, so nothing but a lexicon recognizes one. Every entry is
 * a word that cannot be read as a noun: A homograph such as `name` or `report` would read a head noun as a verb.
 */
export const BARE_VERBS: ReadonlySet<string> = new Set([
  'accept',
  'acknowledge',
  'allow',
  'apply',
  'assume',
  'avoid',
  'begin',
  'believe',
  'bring',
  'choose',
  'compare',
  'comprise',
  'consider',
  'contain',
  'convey',
  'create',
  'decide',
  'declare',
  'define',
  'deliver',
  'describe',
  'determine',
  'discard',
  'distinguish',
  'emit',
  'enable',
  'encode',
  'enforce',
  'ensure',
  'exclude',
  'expect',
  'explain',
  'extend',
  'extract',
  'follow',
  'forbid',
  'govern',
  'hide',
  'ignore',
  'imply',
  'include',
  'inherit',
  'invoke',
  'know',
  'leave',
  'lose',
  'maintain',
  'mean',
  'mention',
  'obtain',
  'omit',
  'perform',
  'permit',
  'prefer',
  'prevent',
  'produce',
  'provide',
  'receive',
  'recognize',
  'reduce',
  'reject',
  'remove',
  'render',
  'repeat',
  'replace',
  'require',
  'resolve',
  'retain',
  'reveal',
  'satisfy',
  'seek',
  'select',
  'send',
  'solve',
  'suppose',
  'surround',
  'sustain',
  'teach',
  'tolerate',
  'treat',
  'understand',
  'verify',
  'want',
  'withhold',
]);

/**
 * Forms of `be`. A chain ending in one reads as passive or copular rather than active, which is what decides whether
 * the clause that it closes still has an object gap to fill.
 */
export const BE_FORMS: ReadonlySet<string> = new Set(['am', 'are', 'be', 'been', 'being', 'is', 'was', 'were']);

/**
 * Participles whose verb takes two objects. A passive promotes one and leaves the other open, so a head noun can fill
 * the gap that remains: `the paths it is given` is the construction, whereas `the paths it is used` is not.
 */
export const DITRANSITIVE_PARTICIPLES: ReadonlySet<string> = new Set([
  'assigned',
  'awarded',
  'given',
  'granted',
  'handed',
  'issued',
  'offered',
  'passed',
  'sent',
  'shown',
  'taught',
  'told',
]);

/**
 * Verbs that don't take an object. One of these closing a subject reads as the sentence's own verb rather than a
 * relative's, which is what keeps a main clause out. The set is read from both directions: {@link isFiniteVerb}
 * rejects a member outright, and the two clause-closing tests admit one back when a stranded preposition gives it a
 * prepositional-phrase gap, so `the set the entries belong to` reports, whereas `the entries belong to the set`
 * does not.
 */
export const INTRANSITIVE_VERBS: ReadonlySet<string> = new Set([
  'appear',
  'arise',
  'become',
  'belong',
  'come',
  'consist',
  'depend',
  'differ',
  'emerge',
  'exist',
  'go',
  'happen',
  'matter',
  'occur',
  'persist',
  'remain',
  'stay',
  'vary',
]);

/**
 * Past-tense forms that don't have a verbal suffix, so nothing but a lexicon recognizes one. Admission follows the
 * rule that {@link BARE_VERBS} states, which keeps `cost`, `put`, `set`, and `spread` out. A past participle doesn't
 * need an entry, since {@link resolveAuxiliaryChain} admits whatever an auxiliary carries.
 */
export const IRREGULAR_PAST_VERBS: ReadonlySet<string> = new Set([
  'began',
  'bought',
  'broke',
  'brought',
  'built',
  'caught',
  'chose',
  'dealt',
  'drew',
  'drove',
  'found',
  'gave',
  'grew',
  'held',
  'kept',
  'knew',
  'laid',
  'led',
  'left',
  'lent',
  'lost',
  'made',
  'meant',
  'met',
  'paid',
  'read',
  'said',
  'sent',
  'sold',
  'sought',
  'spent',
  'struck',
  'swept',
  'taught',
  'thought',
  'threw',
  'told',
  'took',
  'understood',
  'withheld',
  'won',
  'wrote',
]);

/**
 * Auxiliaries that also serve as a clause's transitive main verb, which is what `the version the consumer has` turns
 * on. A `be` form is absent: A copula doesn't take an object, so a clause that it closes doesn't have a
 * gap to find.
 */
export const MAIN_VERB_AUXILIARIES: ReadonlySet<string> = new Set(['did', 'do', 'does', 'had', 'has', 'have']);

/** Words ending in `s` that cannot be read as a verb, which the morphological test would otherwise admit. */
export const S_FINAL_NON_VERBS: ReadonlySet<string> = new Set([
  'always',
  'hers',
  'ours',
  'perhaps',
  'plus',
  'sometimes',
  'theirs',
  'thus',
  'versus',
  'yes',
  'yours',
]);
