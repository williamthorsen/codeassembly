import { Actor, BaseAlign, Color, Font, Text, TextAlign, type Vector } from 'excalibur';

export interface CatwalkStationActorConfig {
  phase: string;
  color: string;
  absent: boolean;
}

export class CatwalkStationActor extends Actor {
  constructor(config: CatwalkStationActorConfig, position: Vector) {
    super({ pos: position });

    const label = new Text({
      text: config.phase,
      color: Color.fromHex(config.color),
      font: new Font({
        size: 10,
        bold: true,
        family: 'monospace',
        textAlign: TextAlign.Center,
        baseAlign: BaseAlign.Top,
      }),
    });

    this.graphics.use(label);
    this.graphics.opacity = config.absent ? 0.3 : 1;
  }

  updateConfig(config: CatwalkStationActorConfig): void {
    this.graphics.opacity = config.absent ? 0.3 : 1;
  }
}
