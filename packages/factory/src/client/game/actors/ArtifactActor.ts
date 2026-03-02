import { Actor, Color, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

export const ARTIFACT_COLORS: Record<string, string> = {
  architecture: PALETTE.blue,
  plan: PALETTE.green,
  code: PALETTE.yellow,
  review: PALETTE.red,
  simplifier: PALETTE.darkMagenta,
  holistic: PALETTE.darkCyan,
};

interface ArtifactActorCallbacks {
  onEnter: (pageX: number, pageY: number) => void;
  onLeave: () => void;
}

export class ArtifactActor extends Actor {
  constructor(type: string, position: Vector, size?: { width: number; height: number }, callbacks?: ArtifactActorCallbacks) {
    const color = ARTIFACT_COLORS[type] ?? PALETTE.cyan;
    const { width, height } = size ?? { width: 12, height: 12 };
    super({
      pos: position,
      width,
      height,
      color: Color.fromHex(color),
    });

    if (callbacks !== undefined) {
      this.on('pointerenter', (evt) => {
        callbacks.onEnter(evt.pagePos.x, evt.pagePos.y);
      });
      this.on('pointerleave', () => {
        callbacks.onLeave();
      });
    }
  }
}
