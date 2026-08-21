import Phaser from 'phaser';
import type { CombatSceneContext } from './combat-scene';
import { CombatScene } from './combat-scene';

/**
 * Owns the Phaser Game instance for the Combat Screen shell (Repository
 * Architecture §5.5). The game is created with the approved fixed scene and a
 * canvas filling the container. Only this module and the lazy entry may touch
 * Phaser lifecycle; the returned game is destroyed by the session `dispose`.
 */
export function createCombatGame(
  container: HTMLElement,
  context: CombatSceneContext,
): Phaser.Game {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  class BoundCombatScene extends CombatScene {
    constructor() {
      super(context);
    }
  }
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width,
    height,
    scene: [BoundCombatScene],
  });
}
