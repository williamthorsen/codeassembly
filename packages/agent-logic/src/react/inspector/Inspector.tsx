import type { ComponentType, ReactElement, ReactNode } from 'react';

import {
  type ActionDescription,
  type AmbientDescription,
  type ConfigDescription,
  type ElementDescription,
  listStateKinds,
  listTransitionKinds,
  type StateDescription,
  type TransitionDescription,
} from '../../layout/describe-config.ts';
import { GlossedLabel } from '../gloss/GlossedLabel.tsx';
import type { LinkButtonProps } from '../slots.ts';

export interface InspectorProps {
  element: ElementDescription | undefined;
  description: ConfigDescription;
  /** Receives the path of a state or transition named in the inspector when it is clicked. */
  onSelect: (path: string) => void;
  /** The app's in-page link, through which the inspector renders each state and transition that it names. */
  LinkButton: ComponentType<LinkButtonProps>;
}

/** The panel that describes the selected state, transition, or ambient instruction and the states that it connects. */
export function Inspector({ element, description, onSelect, LinkButton }: InspectorProps): ReactElement {
  const context = { description, onSelect, LinkButton };
  return (
    <aside aria-label="Selection" className="statechart-inspector">
      {element === undefined ? (
        <p className="statechart-inspector__empty">Select a state or transition, or a passage in the prompt.</p>
      ) : element.kind === 'ambient' ? (
        <AmbientDetails ambient={element} context={context} />
      ) : element.kind === 'state' ? (
        <StateDetails state={element} context={context} />
      ) : (
        <TransitionDetails transition={element} context={context} />
      )}
    </aside>
  );
}

// region | Helpers
/** A fact's label and the gloss that explains it. */
interface FactLabel {
  label: string;
  gloss: string;
}

/** The label and gloss of each fact that the inspector shows. */
const FACTS = {
  anyTimeExits: { label: 'Any-time exits', gloss: 'Transitions out of the flow, from any of its states' },
  condition: { label: 'Condition', gloss: 'What must hold for the agent to take this transition' },
  entrances: { label: 'Entrances', gloss: 'Transitions into this state' },
  exitActions: { label: 'Actions on leaving', gloss: 'What the agent does on leaving this state' },
  exits: { label: 'Exits', gloss: 'Transitions out of this state' },
  flow: { label: 'Flow', gloss: 'The flow throughout which this instruction applies' },
  promptText: { label: 'Prompt text', gloss: 'The instruction as the prompt states it' },
  stateActions: { label: 'Actions', gloss: 'What the agent does on reaching this state' },
  transitionActions: { label: 'Actions', gloss: 'What the agent does on taking this transition' },
} satisfies Record<string, FactLabel>;

/** What every part of the inspector reads besides its own element. */
interface InspectorContext {
  description: ConfigDescription;
  onSelect: (path: string) => void;
  LinkButton: ComponentType<LinkButtonProps>;
}

/** A labelled list of actions in converted prose. */
function ActionList({ fact, actions }: { fact: FactLabel; actions: ActionDescription[] }): ReactElement {
  return (
    <Fact fact={fact}>
      {actions.length === 0 ? (
        <span className="statechart-inspector__none">None</span>
      ) : (
        <ul className="statechart-inspector__actions">
          {actions.map(({ text, gate }) => (
            <li key={text}>
              {gate ? (
                <>
                  <em className="statechart-inspector__aside">gate</em>{' '}
                </>
              ) : undefined}
              {text}
            </li>
          ))}
        </ul>
      )}
    </Fact>
  );
}

/** The details of a selected ambient instruction: its passage in full and the container that it holds throughout. */
function AmbientDetails({
  ambient,
  context: { description, onSelect, LinkButton },
}: {
  ambient: AmbientDescription;
  context: InspectorContext;
}): ReactElement {
  const container = description.states.find(({ id }) => id === ambient.containerId);

  return (
    <Details heading="Ambient instruction">
      <KindList kinds={ambient.gate ? ['Gate'] : []} />
      <Fact fact={FACTS.flow}>
        {container === undefined ? (
          <span>{ambient.containerName}</span>
        ) : (
          <span>
            <LinkButton onClick={() => onSelect(container.path)}>{container.name}</LinkButton>
          </span>
        )}
      </Fact>
      <Fact fact={FACTS.promptText}>
        <p className="statechart-inspector__quote">{ambient.text}</p>
      </Fact>
    </Details>
  );
}

/** The selected element's heading above its facts. */
function Details({ heading, children }: { heading: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="statechart-inspector__details">
      <h2 className="statechart-inspector__heading">{heading}</h2>
      {children}
    </div>
  );
}

/** A fact of the selected element under its glossed label. */
function Fact({ fact: { label, gloss }, children }: { fact: FactLabel; children: ReactNode }): ReactElement {
  return (
    <div className="statechart-inspector__fact">
      <GlossedLabel
        label={<span className="statechart-inspector__aside">{label}</span>}
        gloss={gloss}
        placement="below"
      />
      {children}
    </div>
  );
}

/** The kinds of the selected element, each as an outlined tag. */
function KindList({ kinds }: { kinds: string[] }): ReactElement | undefined {
  if (kinds.length === 0) return undefined;
  return (
    <ul className="statechart-inspector__kinds">
      {kinds.map((kind) => (
        <li key={kind} className="statechart-inspector__kind">
          {kind}
        </li>
      ))}
    </ul>
  );
}

/** Lists a state's flow-wide transitions: its own for a compound state, its ancestors' for any other. */
function listFlowWideTransitions(state: StateDescription, description: ConfigDescription): TransitionDescription[] {
  if (state.isCompound) return description.transitions.filter(({ sourceId }) => sourceId === state.id);
  const ancestorIds = new Set<string>();
  for (let parentId = state.parentId; parentId !== undefined;) {
    ancestorIds.add(parentId);
    parentId = description.states.find(({ id }) => id === parentId)?.parentId;
  }
  return description.transitions.filter(({ sourceId, isGlobal }) => isGlobal && ancestorIds.has(sourceId));
}

/** Names a transition by its event, or by the word that stands for an eventless one. */
function nameTrigger(transition: TransitionDescription): string {
  return transition.event ?? (transition.isFallback ? 'otherwise' : 'always');
}

/** The details of a selected state. */
function StateDetails({ state, context }: { state: StateDescription; context: InspectorContext }): ReactElement {
  const { description } = context;
  const exits = state.isCompound ? [] : description.transitions.filter(({ sourceId }) => sourceId === state.id);
  const entrances = description.transitions.filter(
    ({ targetId, sourceId }) => targetId === state.id && sourceId !== state.id,
  );
  const flowWide = listFlowWideTransitions(state, description);

  return (
    <Details heading={state.name}>
      <KindList kinds={listStateKinds(state)} />
      {state.entry.length > 0 ? <ActionList fact={FACTS.stateActions} actions={state.entry} /> : undefined}
      {state.exit.length > 0 ? <ActionList fact={FACTS.exitActions} actions={state.exit} /> : undefined}
      {exits.length > 0 ? (
        <Fact fact={FACTS.exits}>
          <TransitionList transitions={exits} direction="to" context={context} />
        </Fact>
      ) : undefined}
      {flowWide.length > 0 ? (
        <Fact fact={FACTS.anyTimeExits}>
          <TransitionList transitions={flowWide} direction="to" context={context} />
        </Fact>
      ) : undefined}
      {entrances.length > 0 ? (
        <Fact fact={FACTS.entrances}>
          <TransitionList transitions={entrances} direction="from" context={context} />
        </Fact>
      ) : undefined}
    </Details>
  );
}

/** The details of a selected transition. */
function TransitionDetails({
  transition,
  context: { description, onSelect, LinkButton },
}: {
  transition: TransitionDescription;
  context: InspectorContext;
}): ReactElement {
  const source = description.states.find(({ id }) => id === transition.sourceId);
  const target = description.states.find(({ id }) => id === transition.targetId);

  return (
    <Details heading={<span className="statechart-inspector__code">{nameTrigger(transition)}</span>}>
      <div className="statechart-inspector__row">
        {source === undefined ? undefined : (
          <LinkButton onClick={() => onSelect(source.path)}>{source.name}</LinkButton>
        )}
        <span className="statechart-inspector__aside">to</span>
        {target === undefined ? undefined : (
          <LinkButton onClick={() => onSelect(target.path)}>{target.name}</LinkButton>
        )}
      </div>
      <KindList kinds={listTransitionKinds(transition)} />
      <Fact fact={FACTS.condition}>
        {transition.guard === undefined ? (
          <span className="statechart-inspector__none">
            {transition.isFallback ? "Otherwise: no sibling's condition holds" : 'None'}
          </span>
        ) : (
          <span>{transition.guard}</span>
        )}
      </Fact>
      <ActionList fact={FACTS.transitionActions} actions={transition.actions} />
    </Details>
  );
}

/** A list of transitions, each by its trigger and guard, with the state at its other end. */
function TransitionList({
  transitions,
  direction,
  context: { description, onSelect, LinkButton },
}: {
  transitions: TransitionDescription[];
  direction: 'to' | 'from';
  context: InspectorContext;
}): ReactElement {
  if (transitions.length === 0) return <span className="statechart-inspector__none">None</span>;
  return (
    <ul className="statechart-inspector__transitions">
      {transitions.map((transition) => {
        const otherId = direction === 'to' ? transition.targetId : transition.sourceId;
        const other = description.states.find(({ id }) => id === otherId);
        return (
          <li key={transition.path} className="statechart-inspector__row">
            <LinkButton onClick={() => onSelect(transition.path)}>
              <span className="statechart-inspector__code">{nameTrigger(transition)}</span>
            </LinkButton>
            {transition.guard === undefined ? undefined : (
              <span className="statechart-inspector__aside">if {transition.guard}</span>
            )}
            {transition.isFallback && transition.event !== undefined ? (
              <span className="statechart-inspector__aside">otherwise</span>
            ) : undefined}
            <span className="statechart-inspector__aside">{direction}</span>
            {other === undefined ? (
              <span className="statechart-inspector__unnamed">{otherId}</span>
            ) : (
              <LinkButton onClick={() => onSelect(other.path)}>{other.name}</LinkButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
// endregion | Helpers
