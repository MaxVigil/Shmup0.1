import Phaser from 'phaser';
import {
  routeKeyInput,
  shouldForwardPointerMove,
  type CombatInputCommand,
  type CombatInputContext,
  type CombatSimulationState,
  type RoutedKeyIntent,
} from '@application/combat';
import type { CombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import type { CombatGeometry } from '../presentation-config/combat-config';
import {
  COMBAT_RENDER_DEPTH,
  resolveCombatGeometry,
} from '../presentation-config/combat-config';

export interface CombatSceneContext {
  readonly geometry: CombatGeometry;
  readonly bridge: CombatHudBridge;
  /** Prepared `german-fighter` runtime URL, or `null` for the approved fallback. */
  readonly aircraftUrl: string | null;
  readonly initialHullRatio: number;
  /** Forwards semantic input commands to the application simulation (S08). */
  readonly submitCommand: (command: CombatInputCommand) => void;
  /** Advances the fixed-step simulation by one rendered frame and returns the
   *  authoritative snapshot. */
  readonly advanceFrame: (frameDeltaSeconds: number) => CombatSimulationState;
  readonly getSimulationState: () => CombatSimulationState;
}

const AIRCRAFT_TEXTURE_KEY = 'aircraft';

/**
 * Combat Scene shell + presentation (S07–S08): the solid-black approved canvas
 * background, the player aircraft placeholder rendered from the deterministic
 * simulation snapshot, and the Hull Integrity bar positioned through the
 * CombatHudBridge. Phaser is limited to input forwarding and read-only
 * presentation: keyboard/pointer events become semantic commands and each
 * rendered frame advances the fixed-step simulation, then the aircraft is
 * positioned from the authoritative state. Movement, firing, enemies, and
 * collision arrive in later slices; the render order already follows the
 * approved background–aircraft–Hull Bar sequence.
 */
export class CombatScene extends Phaser.Scene {
  private readonly context: CombatSceneContext;
  private geometry: CombatGeometry;
  private readonly hullRatio: number;
  private aircraftImage: Phaser.GameObjects.Image | null = null;
  private fallbackGraphics: Phaser.GameObjects.Graphics | null = null;
  private aircraftAspectRatio = 0;
  private aircraftLoadStarted = false;
  private isShuttingDown = false;
  private simState: CombatSimulationState;
  /** Read-only stable-ID visual map for player projectiles (S09): Phaser
   *  reflects the authoritative snapshot each frame and never owns projectile
   *  lifetime, firing cadence, damage, position, or removal. */
  private readonly projectileVisuals = new Map<
    number,
    Phaser.GameObjects.Rectangle
  >();
  /** Read-only stable-ID visual map for active Basic Drones (S10): Phaser
   *  reflects the authoritative snapshot each frame and never owns enemy
   *  lifetime, spawning, movement, hitbox, or escape. */
  private readonly enemyVisuals = new Map<
    number,
    Phaser.GameObjects.Rectangle
  >();

  constructor(context: CombatSceneContext) {
    super({ key: 'combat' });
    this.context = context;
    this.geometry = context.geometry;
    this.hullRatio = context.initialHullRatio;
    this.simState = context.getSimulationState();
  }

  create(): void {
    // Guard for async aircraft decoding, input, and scale listeners: the game
    // may be disposed while a callback is pending, so Combat-owned callbacks
    // must not dereference Phaser objects after destruction (Repository
    // Architecture §9 cleanup).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isShuttingDown = true;
      // Enemy and projectile visuals are scene-owned and destroyed with it; the
      // maps are cleared so no stale id → destroyed-object references survive
      // (S09/S10 cleanup).
      this.enemyVisuals.clear();
      this.projectileVisuals.clear();
      this.removeCombatListeners();
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.registerCombatListeners();
    this.cameras.main.setBackgroundColor(this.geometry.backgroundColor);
    this.layoutAircraft();
  }

  override update(_time: number, delta: number): void {
    if (this.isShuttingDown) {
      return;
    }
    this.simState = this.context.advanceFrame(delta / 1000);
    this.positionAircraft(
      this.simState.aircraft.centerX,
      this.simState.aircraft.centerY,
    );
    this.syncEnemyVisuals();
    this.syncProjectileVisuals();
  }

  /** The rendered aircraft aspect ratio (image texture, or approved fallback). */
  private get renderedAircraftAspect(): number {
    return this.aircraftImage !== null
      ? this.aircraftAspectRatio
      : this.geometry.aircraftAspectRatio;
  }

  private registerCombatListeners(): void {
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      // No global key capture: Phaser only adapts raw keyboard facts and
      // forwards the application routing result, so native browser behaviour
      // for focused UI controls is never consumed.
      keyboard.on(
        Phaser.Input.Keyboard.Events.ANY_KEY_DOWN,
        this.handleKeyDown,
        this,
      );
      keyboard.on(
        Phaser.Input.Keyboard.Events.ANY_KEY_UP,
        this.handleKeyUp,
        this,
      );
    }
    this.input.on('pointermove', this.handlePointerMove, this);
  }

  private removeCombatListeners(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.input.off('pointermove', this.handlePointerMove, this);
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.off(
        Phaser.Input.Keyboard.Events.ANY_KEY_DOWN,
        this.handleKeyDown,
        this,
      );
      keyboard.off(
        Phaser.Input.Keyboard.Events.ANY_KEY_UP,
        this.handleKeyUp,
        this,
      );
    }
  }

  /** Current application input-routing context. S08 is always enabled; S13
   *  will gate on Pause / blocking Overlay / browser-safety states. */
  private inputContext(): CombatInputContext {
    return {
      inputEnabled: true,
      nativeInputFocused: isNativeControlFocused(),
    };
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isShuttingDown) {
      return;
    }
    this.applyKeyIntent(
      routeKeyInput(event.code, true, event.repeat, this.inputContext()),
      event,
    );
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.isShuttingDown) {
      return;
    }
    this.applyKeyIntent(
      routeKeyInput(event.code, false, false, this.inputContext()),
      event,
    );
  };

  private applyKeyIntent(intent: RoutedKeyIntent, event: KeyboardEvent): void {
    if (intent.kind === 'none') {
      return;
    }
    event.preventDefault();
    if (intent.kind === 'movement') {
      this.context.submitCommand({
        type: 'combat/keyboard',
        key: intent.key,
        pressed: intent.pressed,
      });
    } else if (intent.kind === 'toggle-mode') {
      this.context.submitCommand({ type: 'combat/toggle-mode' });
    }
  }

  private readonly handlePointerMove = (
    pointer: Phaser.Input.Pointer,
  ): void => {
    if (this.isShuttingDown) {
      return;
    }
    if (
      !shouldForwardPointerMove(
        pointer.x,
        pointer.y,
        this.geometry.viewportWidth,
        this.geometry.viewportHeight,
        this.inputContext(),
      )
    ) {
      return;
    }
    this.context.submitCommand({
      type: 'combat/pointer-move',
      x: pointer.x,
      y: pointer.y,
    });
  };

  /**
   * Viewport resize contract (Combat §12.3, AC-001, AC-053, AC-057, AC-081,
   * MASTER-AC-010, S08): the canvas follows the new gameplay area and the
   * simulation reprojects the authoritative player position and target
   * proportionally, recalculates the movement values/bounds, and clamps the
   * complete aircraft sprite. The same prepared texture is reused.
   */
  private handleScaleResize(gameSize: Phaser.Structs.Size): void {
    if (this.isShuttingDown) {
      return;
    }
    const width = gameSize.width;
    const height = gameSize.height;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.geometry = resolveCombatGeometry({ width, height });
    this.cameras.main.setSize(width, height);
    this.context.submitCommand({
      type: 'combat/viewport-resize',
      width,
      height,
      aircraftWidth:
        this.geometry.aircraftHeightPx * this.geometry.aircraftAspectRatio,
      aircraftHeight: this.geometry.aircraftHeightPx,
    });
    this.simState = this.context.getSimulationState();
    this.layoutAircraft();
    this.syncEnemyVisuals();
    this.syncProjectileVisuals();
  }

  private layoutAircraft(): void {
    if (this.aircraftImage === null && this.fallbackGraphics === null) {
      this.placeAircraft();
      return;
    }
    const height = this.geometry.aircraftHeightPx;
    const width = height * this.renderedAircraftAspect;
    if (this.aircraftImage !== null) {
      this.aircraftImage.setDisplaySize(width, height);
    } else if (this.fallbackGraphics !== null) {
      this.redrawFallbackTriangle();
    }
    this.positionAircraft(
      this.simState.aircraft.centerX,
      this.simState.aircraft.centerY,
    );
  }

  /** Positions the rendered aircraft from the authoritative simulation state. */
  private positionAircraft(centerX: number, centerY: number): void {
    const width = this.geometry.aircraftHeightPx * this.renderedAircraftAspect;
    if (this.aircraftImage !== null) {
      this.aircraftImage.setPosition(centerX, centerY);
    } else if (this.fallbackGraphics !== null) {
      this.fallbackGraphics.setPosition(centerX, centerY);
    }
    this.updateHud(centerX, centerY, width);
  }

  /**
   * Reflects the authoritative projectile snapshot into the stable-ID visual
   * map (S09): a rectangle is created for each new projectile id, existing
   * visuals are repositioned and resized, and visuals whose id left the
   * simulation are destroyed. Cadence, lifetime, damage, position, and removal
   * all remain application-owned.
   */
  /**
   * Reflects the authoritative enemy snapshot into the stable-ID visual map
   * (S10): a solid `danger` square is created for each new Basic Drone id,
   * existing visuals are repositioned/resized, and visuals whose id left the
   * simulation (Escaped) are destroyed. Spawning, movement, hitbox, and escape
   * all remain application-owned. The explicit `COMBAT_RENDER_DEPTH.enemy`
   * layer keeps the canonical background → drone → projectile → aircraft order
   * deterministic regardless of object-creation timing (Combat §4.5, AC-078).
   */
  private syncEnemyVisuals(): void {
    if (this.isShuttingDown) {
      return;
    }
    const { enemies, enemySize } = this.simState;
    const seen = new Set<number>();
    for (const enemy of enemies) {
      seen.add(enemy.id);
      let visual = this.enemyVisuals.get(enemy.id);
      if (visual === undefined) {
        visual = this.add
          .rectangle(
            enemy.centerX,
            enemy.centerY,
            enemySize,
            enemySize,
            hexToNumber(this.geometry.droneColor),
          )
          .setDepth(COMBAT_RENDER_DEPTH.enemy);
        this.enemyVisuals.set(enemy.id, visual);
      } else {
        visual.setPosition(enemy.centerX, enemy.centerY);
        visual.setSize(enemySize, enemySize);
      }
    }
    for (const [id, visual] of this.enemyVisuals) {
      if (!seen.has(id)) {
        visual.destroy();
        this.enemyVisuals.delete(id);
      }
    }
  }

  private syncProjectileVisuals(): void {
    if (this.isShuttingDown) {
      return;
    }
    const { projectiles, projectileWidth, projectileHeight } = this.simState;
    const seen = new Set<number>();
    for (const projectile of projectiles) {
      seen.add(projectile.id);
      let visual = this.projectileVisuals.get(projectile.id);
      if (visual === undefined) {
        visual = this.add.rectangle(
          projectile.centerX,
          projectile.centerY,
          projectileWidth,
          projectileHeight,
          hexToNumber(this.geometry.projectileColor),
        );
        visual.setDepth(COMBAT_RENDER_DEPTH.projectile);
        this.projectileVisuals.set(projectile.id, visual);
      } else {
        visual.setPosition(projectile.centerX, projectile.centerY);
        visual.setSize(projectileWidth, projectileHeight);
      }
    }
    for (const [id, visual] of this.projectileVisuals) {
      if (!seen.has(id)) {
        visual.destroy();
        this.projectileVisuals.delete(id);
      }
    }
  }

  private placeAircraft(): void {
    if (this.aircraftLoadStarted) {
      return;
    }
    this.aircraftLoadStarted = true;
    const { aircraftUrl } = this.context;
    if (aircraftUrl === null) {
      this.fallbackGraphics = this.add.graphics();
      this.fallbackGraphics.setDepth(COMBAT_RENDER_DEPTH.aircraft);
      this.layoutAircraft();
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (this.isShuttingDown) {
        // The Game was disposed while the cached asset finished decoding.
        return;
      }
      if (this.textures.addImage(AIRCRAFT_TEXTURE_KEY, image) === null) {
        this.fallbackGraphics = this.add.graphics();
        this.fallbackGraphics.setDepth(COMBAT_RENDER_DEPTH.aircraft);
        this.layoutAircraft();
        return;
      }
      this.aircraftAspectRatio = image.naturalWidth / image.naturalHeight;
      this.aircraftImage = this.add.image(0, 0, AIRCRAFT_TEXTURE_KEY);
      this.aircraftImage.setDepth(COMBAT_RENDER_DEPTH.aircraft);
      // Re-layout from the current geometry so a resize that raced the asset
      // load is honoured without re-fetching the prepared texture.
      this.layoutAircraft();
    };
    image.onerror = () => {
      if (!this.isShuttingDown) {
        this.fallbackGraphics = this.add.graphics();
        this.fallbackGraphics.setDepth(COMBAT_RENDER_DEPTH.aircraft);
        this.layoutAircraft();
      }
    };
    image.src = aircraftUrl;
  }

  /** Approved solid light-grey upward triangle fallback (Combat AC-056). */
  private redrawFallbackTriangle(): void {
    const graphics = this.fallbackGraphics;
    if (graphics === null) {
      return;
    }
    const height = this.geometry.aircraftHeightPx;
    const width = height * this.geometry.aircraftAspectRatio;
    graphics.clear();
    graphics.fillStyle(hexToNumber(this.geometry.aircraftFallbackColor), 1);
    // Drawn around the local origin so the whole triangle moves via
    // `graphics.setPosition` from the authoritative simulation state.
    graphics.fillTriangle(
      -width / 2,
      height / 2,
      width / 2,
      height / 2,
      0,
      -height / 2,
    );
  }

  private updateHud(
    centerX: number,
    centerY: number,
    aircraftWidth: number,
  ): void {
    this.context.bridge.update({
      aircraftCenterX: centerX,
      aircraftBottomY: centerY + this.geometry.aircraftHeightPx / 2,
      aircraftWidth,
      hullRatio: this.hullRatio,
      viewportShortSide: this.geometry.shortSide,
    });
  }
}

function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

/** Raw-fact adaptation (Technical Foundation §7): true when a native UI
 *  control owns focus, so the routing table can reject global Combat keys
 *  without interfering with native keyboard behaviour. */
function isNativeControlFocused(): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) {
    return false;
  }
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}
