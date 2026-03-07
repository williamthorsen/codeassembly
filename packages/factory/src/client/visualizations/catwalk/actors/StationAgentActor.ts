import { Actor, BaseAlign, Circle, Color, Font, GraphicsGroup, Text, TextAlign, vec, type Vector } from 'excalibur';

import { AGENT_PULSE_MAX, AGENT_PULSE_MIN, DEACTIVATED_OPACITY, PULSE_FREQUENCY } from '../constants/animation.js';
import { AGENT_RADIUS } from '../constants/dimensions.js';
import { PAUSE_DURATION } from '../constants/timing.js';
import type { AgentAnimationState } from '../types.js';

export interface StationAgentActorConfig {
  id: string;
  role: string;
  color: string;
  state: AgentAnimationState;
}

/** Maps an agent animation state to a visual opacity so idle/resting agents appear dimmed. */
function opacityForState(state: AgentAnimationState): number {
  switch (state) {
    case 'idle':
      return 0.3;
    case 'resting':
      return 0.6;
    case 'deactivated':
      return DEACTIVATED_OPACITY;
    case 'working':
    case 'walking':
    case 'celebrating':
    case 'concerned':
      return 1;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Renders a station-bound agent as a colored circle with a role label, dimmed by animation state. */
export class StationAgentActor extends Actor {
  private _state: AgentAnimationState;
  private _pulsing = false;
  private _elapsed = 0;

  constructor(config: StationAgentActorConfig, position: Vector) {
    super({ pos: position });
    this._state = config.state;
    this._pulsing = config.state === 'working';

    const circle = new Circle({
      radius: AGENT_RADIUS,
      color: Color.fromHex(config.color),
    });

    const label = new Text({
      text: config.role,
      color: Color.fromHex('#111111'),
      font: new Font({
        size: 9,
        bold: true,
        family: 'monospace',
        textAlign: TextAlign.Center,
        baseAlign: BaseAlign.Middle,
      }),
    });

    const group = new GraphicsGroup({
      useAnchor: false,
      members: [
        { graphic: circle, offset: vec(0, 0) },
        { graphic: label, offset: vec(AGENT_RADIUS, AGENT_RADIUS), useBounds: false },
      ],
    });

    this.graphics.use(group);
    this.graphics.opacity = opacityForState(config.state);
  }

  /** Animate a transition to a new state with opacity fade and optional pulse. */
  animateToState(state: AgentAnimationState): void {
    this._state = state;
    this._pulsing = state === 'working';
    if (this._pulsing) {
      this._elapsed = 0;
    } else {
      this.actions.fade(opacityForState(state), PAUSE_DURATION);
    }
  }

  /** Fade in from invisible to state-appropriate opacity. */
  fadeIn(): void {
    this.graphics.opacity = 0;
    this.actions.fade(opacityForState(this._state), PAUSE_DURATION);
  }

  override onPreUpdate(_engine: unknown, deltaMs: number): void {
    if (!this._pulsing) return;
    this._elapsed += deltaMs;
    const t = Math.sin((this._elapsed * PULSE_FREQUENCY * Math.PI * 2) / 1000);
    this.graphics.opacity = AGENT_PULSE_MIN + ((AGENT_PULSE_MAX - AGENT_PULSE_MIN) * (t + 1)) / 2;
  }
}
