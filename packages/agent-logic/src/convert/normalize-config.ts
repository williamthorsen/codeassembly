import type {
  Action,
  AgentLogicConfig,
  AmbientSpan,
  ElementMeta,
  Finding,
  NlEntry,
  StateConfig,
  StateMeta,
  TransitionConfig,
  UnconvertedSpan,
} from '../schema/agent-logic-schema.ts';

/** Number of words of a state's span text from which its id is derived. */
const ID_WORD_COUNT = 4;

/**
 * Rewrites a config into its canonical form, so that two configs describing the same logic serialize identically.
 * Each state's key and id derive from the first words of its span text, `initial` and every target follow the new
 * ids, and states, events, unconverted passages, ambient passages, findings, and object members take a fixed order.
 * The order of transitions within one event or `always` list, and of actions, is kept, because XState evaluates them
 * in order. The root keeps its id.
 */
export function normalizeConfig(config: AgentLogicConfig): AgentLogicConfig {
  const { prompt } = config.meta;
  const newIdsByOldId = assignIds(config, prompt);

  function renameState(id: string): string {
    return newIdsByOldId.get(id) ?? id;
  }

  function normalizeTransition({ target, guard, actions, meta }: TransitionConfig): TransitionConfig {
    return omitUndefined({
      target: target === undefined ? undefined : `#${renameState(target.slice(1))}`,
      guard: guard === undefined ? undefined : normalizeEntry(guard),
      actions: actions?.map(normalizeAction),
      meta: normalizeMeta(meta),
    });
  }

  function normalizeTransitions(
    transitions: TransitionConfig | TransitionConfig[] | undefined,
  ): TransitionConfig | TransitionConfig[] | undefined {
    if (transitions === undefined) return undefined;
    if (!Array.isArray(transitions)) return normalizeTransition(transitions);
    const [only, ...rest] = transitions;
    if (only !== undefined && rest.length === 0) return normalizeTransition(only);
    return transitions.map(normalizeTransition);
  }

  function normalizeEvents(on: StateConfig['on']): Record<string, TransitionConfig | TransitionConfig[]> | undefined {
    if (on === undefined) return undefined;
    const normalized: Record<string, TransitionConfig | TransitionConfig[]> = {};
    for (const event of Object.keys(on).toSorted(compareStrings)) {
      const transitions = normalizeTransitions(on[event]);
      if (transitions !== undefined) normalized[event] = transitions;
    }
    return normalized;
  }

  function normalizeChildren(states: Record<string, StateConfig> | undefined): Record<string, StateConfig> | undefined {
    if (states === undefined) return undefined;
    const children = sortStates(Object.entries(states), prompt).map(([, state]) => normalizeState(state));
    return Object.fromEntries(children.map((child) => [child.id, child]));
  }

  function renameInitial(
    states: Record<string, StateConfig> | undefined,
    initial: string | undefined,
  ): string | undefined {
    if (initial === undefined) return undefined;
    const child = states?.[initial];
    return child === undefined ? initial : renameState(child.id);
  }

  function normalizeState(state: StateConfig): StateConfig {
    return omitUndefined({
      id: renameState(state.id),
      type: state.type,
      initial: renameInitial(state.states, state.initial),
      entry: state.entry?.map(normalizeAction),
      exit: state.exit?.map(normalizeAction),
      on: normalizeEvents(state.on),
      always: normalizeTransitions(state.always),
      states: normalizeChildren(state.states),
      meta: normalizeStateMeta(state.meta),
    });
  }

  return omitUndefined({
    id: config.id,
    initial: renameInitial(config.states, config.initial) ?? config.initial,
    entry: config.entry?.map(normalizeAction),
    exit: config.exit?.map(normalizeAction),
    on: normalizeEvents(config.on),
    always: normalizeTransitions(config.always),
    states: normalizeChildren(config.states) ?? {},
    meta: omitUndefined({
      name: config.meta.name,
      prompt,
      source: { start: config.meta.source.start, end: config.meta.source.end },
      unconverted: config.meta.unconverted.toSorted(compareSpans).map(normalizeUnconverted),
      ambient: normalizeAmbient(config.meta.ambient),
      findings: normalizeFindings(config.meta.findings),
    }),
  });
}

/** Derives a state id from its span text: the first words, lowercase ASCII letters and digits joined by `_`. */
export function slugifyStateText(text: string): string {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const slug = words.slice(0, ID_WORD_COUNT).join('_');
  if (slug === '') return 'state';
  return /^[0-9]/.test(slug) ? `s_${slug}` : slug;
}

// region | Helpers
/**
 * Maps each state's current id to its derived id, visiting states in canonical order so that colliding slugs take
 * their `_2`, `_3`, … suffixes in that order.
 */
function assignIds(config: AgentLogicConfig, prompt: string): Map<string, string> {
  const newIdsByOldId = new Map<string, string>();
  const used = new Set([config.id]);
  visit(config.states);
  return newIdsByOldId;

  function visit(states: Record<string, StateConfig> | undefined): void {
    const siblings = sortStates(Object.entries(states ?? {}), prompt);
    for (const [, state] of siblings) {
      const base = slugifyStateText(sliceSource(state, prompt));
      let id = base;
      for (let suffix = 2; used.has(id); suffix += 1) id = `${base}_${suffix}`;
      used.add(id);
      newIdsByOldId.set(state.id, id);
      visit(state.states);
    }
  }
}

function compareSpans(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return a.start - b.start || a.end - b.end;
}

/** Compares by UTF-16 code units, so that the order does not depend on the locale. */
function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function normalizeAction({ params, meta }: Action): Action {
  return omitUndefined({
    ...normalizeEntry({ type: 'nl', params }),
    meta:
      meta === undefined ? undefined : { source: { start: meta.source.start, end: meta.source.end }, gate: meta.gate },
  });
}

function normalizeAmbient(ambient: AmbientSpan[] | undefined): AmbientSpan[] | undefined {
  return ambient?.toSorted(compareSpans).map(({ start, end, gate }) => omitUndefined({ start, end, gate }));
}

function normalizeEntry({ params }: NlEntry): NlEntry {
  return { type: 'nl', params: { text: params.text } };
}

/** Orders findings by their first source, then kind, after ordering each finding's sources by start. */
function normalizeFindings(findings: Finding[] | undefined): Finding[] | undefined {
  return findings
    ?.map(({ kind, sources, reason }) => ({
      kind,
      sources: sources.toSorted(compareSpans).map(({ start, end }) => ({ start, end })),
      reason,
    }))
    .toSorted(
      (a, b) =>
        compareSpans(a.sources[0] ?? { start: 0, end: 0 }, b.sources[0] ?? { start: 0, end: 0 }) ||
        compareStrings(a.kind, b.kind),
    );
}

function normalizeMeta({ source, inferred, gate, ambient, findings }: ElementMeta): ElementMeta {
  return omitUndefined({
    source: { start: source.start, end: source.end },
    inferred,
    gate,
    ambient: normalizeAmbient(ambient),
    findings: normalizeFindings(findings),
  });
}

function normalizeStateMeta({ name, ...meta }: StateMeta): StateMeta {
  return omitUndefined({ name, ...normalizeMeta(meta) });
}

function normalizeUnconverted({ start, end, reason }: UnconvertedSpan): UnconvertedSpan {
  return omitUndefined({ start, end, reason });
}

/** Removes the members whose value is undefined, so that the result contains only the members that are present. */
function omitUndefined<T extends object>(value: T): T {
  for (const [key, member] of Object.entries(value)) {
    if (member === undefined) Reflect.deleteProperty(value, key);
  }
  return value;
}

function sliceSource(state: StateConfig, prompt: string): string {
  return prompt.slice(state.meta.source.start, state.meta.source.end);
}

/** Orders sibling states by span start, then end, then derived slug, then current key. */
function sortStates(entries: [string, StateConfig][], prompt: string): [string, StateConfig][] {
  return entries.toSorted(
    ([keyA, a], [keyB, b]) =>
      compareSpans(a.meta.source, b.meta.source) ||
      compareStrings(slugifyStateText(sliceSource(a, prompt)), slugifyStateText(sliceSource(b, prompt))) ||
      compareStrings(keyA, keyB),
  );
}
// endregion | Helpers
