import { Actor, BaseAlign, Circle, Color, Font, GraphicsGroup, Text, TextAlign, vec, type Vector } from 'excalibur';

import { AGENT_RADIUS } from '../constants/dimensions.js';
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
  constructor(config: StationAgentActorConfig, position: Vector) {
    super({ pos: position });

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

  updateConfig(config: StationAgentActorConfig): void {
    this.graphics.opacity = opacityForState(config.state);
  }
}
