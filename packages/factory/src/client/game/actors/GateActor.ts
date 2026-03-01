import { Actor, Color, type Engine, Rectangle, type Vector } from 'excalibur';

import { PALETTE } from '../../../shared/constants/palette.js';

export const GATE_WIDTH_PX = 5;
export const GATE_BLOCKING_HEIGHT_PX = 40;
export const GATE_NONBLOCKING_HEIGHT_PX = 2;
export const GATE_TRANSITION_DURATION_MS = 1000;

export class GateActor extends Actor {
  private isOpen: boolean;
  private rectGraphic: Rectangle;
  private platformSurfaceY: number;
  private animationElapsed: number | undefined;
  private startHeight: number;
  private targetHeight: number;
  private openResolvers: Array<() => void> = [];

  constructor(open: boolean, position: Vector) {
    const initialHeight = open ? GATE_NONBLOCKING_HEIGHT_PX : GATE_BLOCKING_HEIGHT_PX;
    const platformSurfaceY = position.y + GATE_BLOCKING_HEIGHT_PX / 2;

    super({
      pos: position.clone(),
      width: GATE_WIDTH_PX,
    });

    this.isOpen = open;
    this.platformSurfaceY = platformSurfaceY;
    this.startHeight = initialHeight;
    this.targetHeight = initialHeight;

    const color = open ? PALETTE.green : PALETTE.red;
    this.rectGraphic = new Rectangle({
      width: GATE_WIDTH_PX,
      height: initialHeight,
      color: Color.fromHex(color),
    });

    this.graphics.use(this.rectGraphic);
    this.pos.y = this.platformSurfaceY - initialHeight / 2;
  }

  setOpen(open: boolean): void {
    if (open === this.isOpen) return;

    this.isOpen = open;

    const color = open ? PALETTE.green : PALETTE.red;
    this.rectGraphic.color = Color.fromHex(color);

    this.startHeight = this.rectGraphic.height;
    this.targetHeight = open ? GATE_NONBLOCKING_HEIGHT_PX : GATE_BLOCKING_HEIGHT_PX;
    this.animationElapsed = 0;
  }

  waitForOpen(): Promise<void> {
    if (this.isOpen && this.animationElapsed === undefined) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.openResolvers.push(resolve);
    });
  }

  override onPreUpdate(_engine: Engine, elapsed: number): void {
    if (this.animationElapsed === undefined) return;

    this.animationElapsed += elapsed;
    const progress = Math.min(1, this.animationElapsed / GATE_TRANSITION_DURATION_MS);
    const currentHeight = this.startHeight + (this.targetHeight - this.startHeight) * progress;

    this.rectGraphic.height = currentHeight;
    this.pos.y = this.platformSurfaceY - currentHeight / 2;

    if (progress >= 1) {
      this.animationElapsed = undefined;

      // Flush all pending resolvers regardless of direction. When closing,
      // resolvers must still be drained to prevent permanently blocking callers.
      // Callers that need to re-check gate state can do so after resolution.
      const resolvers = this.openResolvers;
      this.openResolvers = [];
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }
}
