import { Color, Scene } from 'excalibur';

export class CatwalkScene extends Scene {
  constructor() {
    super();
    this.backgroundColor = Color.fromHex('#111111');
  }
}
