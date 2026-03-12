import { Actor, Color, GraphicsGroup, Rectangle, vec, type Vector } from 'excalibur';

import {
  ACTIVE_OPACITY,
  DEACTIVATED_OPACITY,
  IDLE_OPACITY,
  PULSE_FREQUENCY,
  RESTING_OPACITY,
  SCALE_PULSE_MAX,
  SCALE_PULSE_MIN,
} from '../constants/animation.js';
import { ACCENT_BAR_H, SPRITE_SIZE, SUBAGENT_SPRITE_BOTTOM_PADDING_PX } from '../constants/dimensions.js';
import { PAUSE_DURATION } from '../constants/timing.js';
import { getAnimation } from '../sprites/catwalk-sprite-loader.js';
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
      return IDLE_OPACITY;
    case 'resting':
      return RESTING_OPACITY;
    case 'deactivated':
      return DEACTIVATED_OPACITY;
    case 'working':
    case 'walking':
    case 'celebrating':
    case 'concerned':
      return ACTIVE_OPACITY;
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
      // Fade ensures opacity reaches 1 even when transitioning from a dimmed state (e.g., idle at 0.3).
      this.actions.fade(ACTIVE_OPACITY, PAUSE_DURATION);
    } else {
      this.scale = vec(1, 1);
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
    const s = SCALE_PULSE_MIN + ((SCALE_PULSE_MAX - SCALE_PULSE_MIN) * (t + 1)) / 2;
    this.scale = vec(s, s);
  }

  /** Builds a GraphicsGroup with the sprite animation and an accent bar, and applies it. */
  private applyGraphics(config: StationAgentActorConfig): void {
    const animation = getAnimation('subagent', config.state);

    const accentBar = new Rectangle({
      width: SPRITE_SIZE,
      height: ACCENT_BAR_H,
      color: Color.fromHex(config.color),
    });

    const halfSprite = SPRITE_SIZE / 2;
    // Render upward from the ground line position:
    // accent bar bottom sits flush on ground line, sprite sits on top of accent bar.
    // SUBAGENT_SPRITE_BOTTOM_PADDING_PX shifts the sprite down so the visible character (not transparent padding)
    // sits flush on the accent bar top.
    const group = new GraphicsGroup({
      useAnchor: false,
      members: [
        {
          graphic: animation,
          offset: vec(-halfSprite, -ACCENT_BAR_H - SPRITE_SIZE + SUBAGENT_SPRITE_BOTTOM_PADDING_PX),
        },
        { graphic: accentBar, offset: vec(-halfSprite, -ACCENT_BAR_H) },
      ],
    });

    this.graphics.use(group);
  }
}
