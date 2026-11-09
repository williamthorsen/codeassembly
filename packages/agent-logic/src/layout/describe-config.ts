import type {
  Action,
  AgentLogicConfig,
  Finding,
  FindingKind,
  Span,
  TransitionConfig,
} from '../schema/agent-logic-schema.ts';
import { listStates, listTransitions, type StateLike, type TransitionEntry } from '../schema/config-traversal.ts';
import { formatPath } from '../schema/validate-config.ts';

/** The key under which an eventless transition's trigger is recorded. */
const ALWAYS_TRIGGER = 'always';

/** What the viewer shows of an action. */
export interface ActionDescription {
  text: string;
  /** Whether the action represents a `<HARD-GATE>` of the prompt. */
  gate: boolean;
  /** The passage of the gate that the action represents; absent for an action that is not a gate. */
  source: Span | undefined;
}

/** What the viewer shows of a state, the root included. */
export interface StateDescription {
  kind: 'state';
  id: string;
  /** The name that the viewer shows: the state's `meta.name`, or its id when it has none. */
  name: string;
  /** Formatted path into the config; the element's selection key. */
  path: string;
  /** The id of the enclosing state; absent for the root. */
  parentId: string | undefined;
  isCompound: boolean;
  isFinal: boolean;
  /** Whether the enclosing state's `initial` names this state, so that its flow starts here. */
  isInitial: boolean;
  waitsForUser: boolean;
  /** Whether the state is a leaf, is not final, and none of its own transitions leads to another state. */
  hasNoExit: boolean;
  /**
   * Whether neither the root's initial state nor any transition enters the state, while its parent is entered, so that
   * it is the outermost state of an unreachable subtree.
   */
  isUnreachable: boolean;
  entry: ActionDescription[];
  exit: ActionDescription[];
  inferred: boolean;
  source: Span;
}

/** What the viewer shows of a transition. */
export interface TransitionDescription {
  kind: 'transition';
  /** Formatted path into the config; the element's selection key. */
  path: string;
  sourceId: string;
  sourceName: string;
  /** The id of the target state; the source's id for a transition without a target. */
  targetId: string;
  targetName: string;
  event: string | undefined;
  guard: string | undefined;
  actions: ActionDescription[];
  /** Whether the transition belongs to a compound state, so that it applies from every state inside it. */
  isGlobal: boolean;
  /** Whether the transition has no guard and a sibling in its list has one, so that it is taken when no guard holds. */
  isFallback: boolean;
  /**
   * Whether the transition has a guard, no sibling in its list, and no enclosing state that handles its trigger, so
   * that nothing happens when the guard fails.
   */
  lacksAlternative: boolean;
  inferred: boolean;
  /** Whether the transition represents a `<HARD-GATE>` of the prompt. */
  gate: boolean;
  source: Span;
}

/** What the viewer shows of an ambient instruction: a passage that holds throughout its container. */
export interface AmbientDescription {
  kind: 'ambient';
  /** Formatted path into the config; the element's selection key. */
  path: string;
  /** The id of the root or compound state that the instruction belongs to. */
  containerId: string;
  containerName: string;
  /** The passage's prompt text. */
  text: string;
  /** Whether the passage is the body of a `<HARD-GATE>`. */
  gate: boolean;
  source: Span;
}

export type ElementDescription = AmbientDescription | StateDescription | TransitionDescription;

/** What the viewer shows of a finding: a flaw that the converter judged from the prompt's prose. */
export interface FindingDescription {
  kind: FindingKind;
  /** Formatted path into the config, unique among findings. */
  path: string;
  reason: string;
  sources: Span[];
  /** The state or transition that the finding concerns; absent for a finding on the root. */
  element: StateDescription | TransitionDescription | undefined;
}

/** A transition's label: a trigger line set as an identifier, then lines of prose. */
export interface TransitionLabel {
  /** The event, or `Any time` for an eventless global transition; absent for any other eventless transition. */
  trigger: string | undefined;
  details: string[];
}

export interface ConfigDescription {
  /** States in document order, each parent before its children. */
  states: StateDescription[];
  transitions: TransitionDescription[];
  /** Ambient instructions, grouped by container in the order of `states`, each group in span order. */
  ambient: AmbientDescription[];
  /** Findings in the order of `states`, each state's own before those of its transitions, the root's first. */
  findings: FindingDescription[];
}

/** Derives the states, transitions, and ambient instructions that the viewer shows from a valid config. */
export function describeConfig(config: AgentLogicConfig): ConfigDescription {
  const states: StateDescription[] = [];
  const transitions: TransitionDescription[] = [];
  const ambient: AmbientDescription[] = [];
  const findings: FindingDescription[] = [];
  const enteredIds = listEnteredIds(config);
  const parentIdByPath = new Map<string, string>();
  const initialPaths = new Set<string>();
  // Map each state to the triggers that it or an enclosing state handles, which XState tries when its own guards fail.
  const triggersByPath = new Map<string, Set<string>>();
  const namesById = new Map(listStates(config).map(({ state }) => [state.id, state.meta.name ?? state.id]));

  /** Returns the name that the viewer shows for the state of an id. */
  function nameState(id: string): string {
    return namesById.get(id) ?? id;
  }

  for (const { path, state } of listStates(config)) {
    const formattedPath = formatPath(path);
    const isCompound = state.states !== undefined;
    const isFinal = 'type' in state && state.type === 'final';
    const stateTransitions = listTransitions(state);
    const enclosingTriggers = triggersByPath.get(formatPath(path.slice(0, -2))) ?? new Set<string>();
    triggersByPath.set(
      formattedPath,
      new Set([...enclosingTriggers, ...stateTransitions.map(({ event }) => event ?? ALWAYS_TRIGGER)]),
    );

    const childKeys = Object.keys(state.states ?? {});
    for (const key of childKeys) {
      parentIdByPath.set(formatPath([...path, 'states', key]), state.id);
    }
    if (state.initial !== undefined) initialPaths.add(formatPath([...path, 'states', state.initial]));

    const parentId = parentIdByPath.get(formattedPath);
    const stateDescription: StateDescription = {
      kind: 'state',
      id: state.id,
      name: nameState(state.id),
      path: formattedPath,
      parentId,
      isCompound,
      isFinal,
      isInitial: initialPaths.has(formattedPath),
      waitsForUser: !isCompound && stateTransitions.some(({ event }) => event?.startsWith('user.') === true),
      hasNoExit: !isCompound && !isFinal && stateTransitions.every(({ transition }) => staysIn(state.id, transition)),
      isUnreachable: isOutermostUnentered(state.id, parentId, enteredIds),
      entry: describeActions(state.entry),
      exit: describeActions(state.exit),
      inferred: 'inferred' in state.meta && state.meta.inferred === true,
      source: state.meta.source,
    };
    states.push(stateDescription);
    findings.push(
      ...describeFindings(state.meta.findings, path, parentId === undefined ? undefined : stateDescription),
    );

    ambient.push(...describeAmbient(path, state, nameState(state.id), config.meta.prompt));

    for (const { path: transitionPath, event, transition } of stateTransitions) {
      const fullPath = [...path, ...transitionPath];
      const transitionDescription: TransitionDescription = {
        kind: 'transition',
        path: formatPath(fullPath),
        sourceId: state.id,
        sourceName: nameState(state.id),
        targetId: transition.target?.slice(1) ?? state.id,
        targetName: nameState(transition.target?.slice(1) ?? state.id),
        event,
        guard: transition.guard?.params.text,
        actions: describeActions(transition.actions),
        isGlobal: isCompound,
        isFallback:
          transition.guard === undefined &&
          stateTransitions.some((sibling) => sibling.event === event && sibling.transition.guard !== undefined),
        lacksAlternative: lacksAlternative(transition, event, stateTransitions, enclosingTriggers),
        inferred: transition.meta.inferred === true,
        gate: transition.meta.gate === true,
        source: transition.meta.source,
      };
      transitions.push(transitionDescription);
      findings.push(...describeFindings(transition.meta.findings, fullPath, transitionDescription));
    }
  }

  return { states, transitions, ambient, findings };
}

/**
 * Builds a transition's label: its trigger, then its guard or the word that stands for one, whether it lacks an
 * alternative, its actions, and whether it is inferred or a gate.
 */
export function buildTransitionLabel(transition: TransitionDescription): TransitionLabel {
  const { event, guard, isFallback, isGlobal, lacksAlternative } = transition;
  const trigger = event === undefined ? (isGlobal ? 'Any time' : undefined) : isGlobal ? `Any time: ${event}` : event;
  const guardLine =
    guard === undefined ? (isFallback ? 'otherwise' : event === undefined ? 'always' : undefined) : `If ${guard}`;
  return {
    trigger,
    details: [
      ...(guardLine === undefined ? [] : [guardLine]),
      ...(lacksAlternative ? ['no alternative'] : []),
      ...transition.actions.map(({ text, gate }) => `Do: ${text}${gate ? ' (gate)' : ''}`),
      ...(transition.inferred ? ['inferred'] : []),
      ...(transition.gate ? ['gate'] : []),
    ],
  };
}

/** Lists the states and transitions that have a gap, each state before its own transitions, in document order. */
export function listGaps({ states, transitions }: ConfigDescription): (StateDescription | TransitionDescription)[] {
  return states.flatMap((state) => [
    ...(state.hasNoExit || state.isUnreachable ? [state] : []),
    ...transitions.filter(({ sourceId, lacksAlternative }) => sourceId === state.id && lacksAlternative),
  ]);
}

/** Lists the kinds that a state shows, in the order in which the viewer names them. */
export function listStateKinds(state: StateDescription): string[] {
  return [
    ...(state.isInitial ? ['Starts its flow'] : []),
    ...(state.waitsForUser ? ['Waits for user'] : []),
    ...(state.entry.length > 0 || state.exit.length > 0 ? ['Performs actions'] : []),
    ...(state.isFinal ? ['Ends'] : []),
    ...(state.inferred ? ['Inferred'] : []),
    ...([...state.entry, ...state.exit].some(({ gate }) => gate) ? ['Has a gate'] : []),
    ...(state.hasNoExit ? ['No exit'] : []),
    ...(state.isUnreachable ? ['Unreachable'] : []),
  ];
}

/** Returns a state's name, or a transition's state name and trigger. */
export function nameElement(element: StateDescription | TransitionDescription): string {
  if (element.kind === 'state') return element.name;
  return `${element.sourceName}, ${buildTransitionLabel(element).trigger ?? 'always'}`;
}

/** Lists the kinds that a transition shows, in the order in which the viewer names them. */
export function listTransitionKinds(transition: TransitionDescription): string[] {
  return [
    ...(transition.isGlobal ? ['Any time'] : []),
    ...(transition.isFallback ? ['Fallback'] : []),
    ...(transition.inferred ? ['Inferred'] : []),
    ...(transition.gate ? ['Gate'] : []),
    ...(transition.lacksAlternative ? ['No alternative'] : []),
  ];
}

// region | Helpers
/** Describes a list of actions in its order. */
function describeActions(actions: Action[] | undefined): ActionDescription[] {
  return (actions ?? []).map(({ params, meta }) => ({
    text: params.text,
    gate: meta?.gate === true,
    source: meta?.source,
  }));
}

/** Describes the ambient instructions of a state, in the order of its list. */
function describeAmbient(
  path: PropertyKey[],
  state: StateLike,
  containerName: string,
  prompt: string,
): AmbientDescription[] {
  return (state.meta.ambient ?? []).map((span, index) => ({
    kind: 'ambient',
    path: formatPath([...path, 'meta', 'ambient', index]),
    containerId: state.id,
    containerName,
    text: prompt.slice(span.start, span.end),
    gate: span.gate === true,
    source: { start: span.start, end: span.end },
  }));
}

/** Describes the findings of an element, or of the root when `element` is absent, in the order of its list. */
function describeFindings(
  findings: Finding[] | undefined,
  path: PropertyKey[],
  element: StateDescription | TransitionDescription | undefined,
): FindingDescription[] {
  return (findings ?? []).map(({ kind, sources, reason }, index) => ({
    kind,
    path: formatPath([...path, 'meta', 'findings', index]),
    reason,
    sources,
    element,
  }));
}

/** Returns whether a state is not entered while its parent, if it has one, is. */
function isOutermostUnentered(id: string, parentId: string | undefined, enteredIds: Set<string>): boolean {
  return !enteredIds.has(id) && (parentId === undefined || enteredIds.has(parentId));
}

/**
 * Returns whether a guarded transition is the only one of its trigger in its state's list, and no enclosing state
 * handles that trigger.
 */
function lacksAlternative(
  transition: TransitionConfig,
  event: string | undefined,
  stateTransitions: TransitionEntry[],
  enclosingTriggers: Set<string>,
): boolean {
  return (
    transition.guard !== undefined &&
    stateTransitions.every((sibling) => sibling.event !== event || sibling.transition === transition) &&
    !enclosingTriggers.has(event ?? ALWAYS_TRIGGER)
  );
}

/**
 * Lists the ids of the states that the machine can enter: The root's initial state is entered first, a state enters
 * its ancestors and, when compound, its initial child, and each entered state's transitions enter their targets.
 */
function listEnteredIds(config: AgentLogicConfig): Set<string> {
  const entries = listStates(config);
  const stateById = new Map(entries.map(({ state }) => [state.id, state]));
  const parentIdById = new Map<string, string>();
  for (const { state } of entries) {
    const children = Object.values(state.states ?? {});
    for (const child of children) parentIdById.set(child.id, state.id);
  }
  const entered = new Set<string>();
  const pending: string[] = [];
  enter(config.id);

  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const state = stateById.get(id);
    if (state === undefined) continue;
    for (const { transition } of listTransitions(state)) {
      if (transition.target !== undefined) enter(transition.target.slice(1));
    }
  }
  return entered;

  function enter(id: string): void {
    for (let ancestor = parentIdById.get(id); ancestor !== undefined; ancestor = parentIdById.get(ancestor)) {
      mark(ancestor);
    }
    for (let state = stateById.get(id); state !== undefined;) {
      mark(state.id);
      state = state.initial === undefined ? undefined : state.states?.[state.initial];
    }
  }

  function mark(id: string): void {
    if (entered.has(id)) return;
    entered.add(id);
    pending.push(id);
  }
}

/** Returns whether a transition runs its actions without leading out of the state of an id. */
function staysIn(stateId: string, transition: TransitionConfig): boolean {
  return transition.target === undefined || transition.target === `#${stateId}`;
}
// endregion | Helpers
