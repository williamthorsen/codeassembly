import { Actor, Color, GraphicsGroup, Rectangle, vec, type Vector } from 'excalibur';

import { AGENT_PULSE_MAX, AGENT_PULSE_MIN, DEACTIVATED_OPACITY, PULSE_FREQUENCY } from '../constants/animation.js';
import { AGENT_RADIUS } from '../constants/dimensions.js';
import { PAUSE_DURATION } from '../constants/timing.js';
import { getAnimation } from '../sprites/catwalk-sprite-loader.js';
import type { AgentAnimationState } from '../types.js';

const ACCENT_BAR_HEIGHT = 4;
const SPRITE_SIZE = AGENT_RADIUS * 2;

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

/** Renders a station-bound agent as an animated sprite with a colored accent bar, dimmed by animation state. */
export class StationAgentActor extends Actor {
  private _state: AgentAnimationState;
  private _config: StationAgentActorConfig;
  private _pulsing = false;
  private _elapsed = 0;

  constructor(config: StationAgentActorConfig, position: Vector) {
    super({ pos: position });
    this._state = config.state;
    this._config = config;
    this._pulsing = config.state === 'working';

    this.applyGraphics(config);
    this.graphics.opacity = opacityForState(config.state);
  }

  /** Animate a transition to a new state with opacity fade and optional pulse. */
  animateToState(state: AgentAnimationState): void {
    this._state = state;
    this._pulsing = state === 'working';
    this.applyGraphics({ ...this._config, state });
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

  /** Builds a GraphicsGroup with the sprite animation and an accent bar, and applies it. */
  private applyGraphics(config: StationAgentActorConfig): void {
    const animation = getAnimation('subagent', config.state);

    const accentBar = new Rectangle({
      width: SPRITE_SIZE,
      height: ACCENT_BAR_HEIGHT,
      color: Color.fromHex(config.color),
    });

    const group = new GraphicsGroup({
      useAnchor: false,
      members: [
        { graphic: animation, offset: vec(0, 0) },
        { graphic: accentBar, offset: vec(0, SPRITE_SIZE) },
      ],
    });

    this.graphics.use(group);
  }
}
