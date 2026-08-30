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
  /** Forwards semantic input commands to the application simulation (S08). */
  readonly submitCommand: (command: CombatInputCommand) => void;
  /** Advances the fixed-step simulation by one rendered frame and returns the
   *  authoritative snapshot. */
  readonly advanceFrame: (frameDeltaSeconds: number) => CombatSimulationState;
  readonly getSimulationState: () => CombatSimulationState;
  /**
   * S13: the authoritative paused/running lifecycle (derived from the one
   * Session Store by the entry). When true, gameplay input routing is disabled
   * through the existing `inputEnabled` seam.
   */
  readonly getPaused: () => boolean;
  /** S13: relays the canonical Escape-open-Pause command to the application. */
  readonly requestPause: () => void;
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
  /** Read-only stable-ID visual map for hitbox-free destroyed-enemy flashes
   *  (S11): white stationary squares that are removed when the 100 ms feedback
   *  expires. They never participate in gameplay or collision. */
  private readonly destroyedEnemyFlashVisuals = new Map<
    number,
    Phaser.GameObjects.Rectangle
  >();
  /** True while the aircraft danger flash is active (drives tint/redraw). */
  private aircraftFlashActive = false;

  constructor(context: CombatSceneContext) {
    super({ key: 'combat' });
    this.context = context;
    this.geometry = context.geometry;
    this.simState = context.getSimulationState();
  }

  create(): void {
    // Guard for async aircraft decoding, input, and scale listeners: the game
    // may be disposed while a callback is pending, so Combat-owned callbacks
    // must not dereference Phaser objects after destruction (Repository
    // Architecture §9 cleanup).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isShuttingDown = true;
      // Enemy, destroyed-enemy-feedback, and projectile visuals are
      // scene-owned and destroyed with it; the maps are cleared so no stale
      // id → destroyed-object references survive (S09/S10/S11 cleanup).
      this.enemyVisuals.clear();
      this.destroyedEnemyFlashVisuals.clear();
      this.projectileVisuals.clear();
      this.aircraftFlashActive = false;
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
    this.syncDestroyedEnemyFlashes();
    this.syncProjectileVisuals();
    this.applyAircraftFlash();
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

  /** Current application input-routing context. S13 gates on the authoritative
   *  paused/running lifecycle: any paused or blocking state disables movement,
   *  pointer, and control-mode routing through this seam. */
  private inputContext(): CombatInputContext {
    return {
      inputEnabled: !this.context.getPaused(),
      nativeInputFocused: isNativeControlFocused(),
    };
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isShuttingDown) {
      return;
    }
    // S13: Escape opens Pause only while running with no Overlay (the routing
    // context is enabled exactly then). While a blocking Overlay is open the
    // React Overlay owns Escape (Resume / Close / Close-Debug); the key
    // auto-repeat is rejected. Key auto-repeat for every other routed binding
    // is already rejected by `routeKeyInput`.
    if (
      !event.repeat &&
      event.code === 'Escape' &&
      this.inputContext().inputEnabled
    ) {
      event.preventDefault();
      this.context.requestPause();
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
    this.syncDestroyedEnemyFlashes();
    this.syncProjectileVisuals();
    this.applyAircraftFlash();
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
    const { enemies, enemySize, activeEnemyFlashStepsRemaining } =
      this.simState;
    const seen = new Set<number>();
    for (const enemy of enemies) {
      seen.add(enemy.id);
      // S11: an active enemy flashes white for 50 ms after a non-destroying hit.
      const flashing = (activeEnemyFlashStepsRemaining[enemy.id] ?? 0) > 0;
      const fillColor = hexToNumber(
        flashing ? this.geometry.enemyFlashColor : this.geometry.droneColor,
      );
      let visual = this.enemyVisuals.get(enemy.id);
      if (visual === undefined) {
        visual = this.add
          .rectangle(
            enemy.centerX,
            enemy.centerY,
            enemySize,
            enemySize,
            fillColor,
          )
          .setDepth(COMBAT_RENDER_DEPTH.enemy);
        this.enemyVisuals.set(enemy.id, visual);
      } else {
        visual.setPosition(enemy.centerX, enemy.centerY);
        visual.setSize(enemySize, enemySize);
        visual.setFillStyle(fillColor);
      }
    }
    for (const [id, visual] of this.enemyVisuals) {
      if (!seen.has(id)) {
        visual.destroy();
        this.enemyVisuals.delete(id);
      }
    }
  }

  /**
   * Reflects the hitbox-free destroyed-enemy flash state (S11): stationary
   * white squares created on destruction and removed when the 100 ms feedback
   * expires. These visuals never participate in gameplay or collision.
   */
  private syncDestroyedEnemyFlashes(): void {
    if (this.isShuttingDown) {
      return;
    }
    const { destroyedEnemyFlashes } = this.simState;
    const seen = new Set<number>();
    for (const flash of destroyedEnemyFlashes) {
      seen.add(flash.enemyId);
      let visual = this.destroyedEnemyFlashVisuals.get(flash.enemyId);
      if (visual === undefined) {
        visual = this.add
          .rectangle(
            flash.centerX,
            flash.centerY,
            flash.size,
            flash.size,
            hexToNumber(this.geometry.enemyFlashColor),
          )
          .setDepth(COMBAT_RENDER_DEPTH.enemy);
        this.destroyedEnemyFlashVisuals.set(flash.enemyId, visual);
      } else {
        visual.setPosition(flash.centerX, flash.centerY);
        visual.setSize(flash.size, flash.size);
      }
    }
    for (const [id, visual] of this.destroyedEnemyFlashVisuals) {
      if (!seen.has(id)) {
        visual.destroy();
        this.destroyedEnemyFlashVisuals.delete(id);
      }
    }
  }

  /**
   * Applies the approved 100 ms aircraft `danger` flash from the authoritative
   * snapshot (S11, Combat §8.5.1) via a texture tint or a fallback redraw, and
   * restores the normal colours exactly when the simulation feedback expires.
   */
  private applyAircraftFlash(): void {
    if (this.isShuttingDown) {
      return;
    }
    const flashing = this.simState.aircraftDangerFlashStepsRemaining > 0;
    if (flashing === this.aircraftFlashActive) {
      return;
    }
    this.aircraftFlashActive = flashing;
    if (this.aircraftImage !== null) {
      if (flashing) {
        this.aircraftImage.setTint(
          hexToNumber(this.geometry.aircraftFlashColor),
        );
      } else {
        this.aircraftImage.clearTint();
      }
    }
    if (this.fallbackGraphics !== null) {
      this.redrawFallbackTriangle();
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
      this.showFallbackAircraft();
      return;
    }
    // MASTER-AC-014 / V02-WI-02 correction C02: `aircraftUrl` is the prepared
    // `data:image/png;base64` bytes built once by the bounded Boot preload
    // (Combat §12.7). Decoding it here issues no second application/network
    // request across first Combat entry, viewport resize, or repeated mission
    // entry, and no application port ever exposes a DOM element.
    const image = new Image();
    image.onload = () => {
      if (this.isShuttingDown) {
        // The Game was disposed while the prepared asset finished decoding.
        return;
      }
      this.createAircraftTexture(image);
    };
    image.onerror = () => {
      if (!this.isShuttingDown) {
        this.showFallbackAircraft();
      }
    };
    image.src = aircraftUrl;
  }

  /** Registers the decoded aircraft element as the texture and lays it out. */
  private createAircraftTexture(image: HTMLImageElement): void {
    if (this.textures.addImage(AIRCRAFT_TEXTURE_KEY, image) === null) {
      this.showFallbackAircraft();
      return;
    }
    this.aircraftAspectRatio = image.naturalWidth / image.naturalHeight;
    this.aircraftImage = this.add.image(0, 0, AIRCRAFT_TEXTURE_KEY);
    this.aircraftImage.setDepth(COMBAT_RENDER_DEPTH.aircraft);
    // Re-layout from the current geometry so a resize that raced the asset
    // load is honoured without re-fetching the prepared texture.
    this.layoutAircraft();
  }

  /** Approved solid light-grey upward triangle fallback (Combat AC-056). */
  private showFallbackAircraft(): void {
    this.fallbackGraphics = this.add.graphics();
    this.fallbackGraphics.setDepth(COMBAT_RENDER_DEPTH.aircraft);
    this.layoutAircraft();
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
    // S11: while the danger flash is active the fallback is drawn in danger.
    graphics.fillStyle(
      hexToNumber(
        this.aircraftFlashActive
          ? this.geometry.aircraftFlashColor
          : this.geometry.aircraftFallbackColor,
      ),
      1,
    );
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
    // S11: the CombatHudBridge is updated from the authoritative player Hull
    // every rendered frame so the bar width and aria-valuenow change in the
    // same frame as damage, without any React per-frame state.
    this.context.bridge.update({
      aircraftCenterX: centerX,
      aircraftBottomY: centerY + this.geometry.aircraftHeightPx / 2,
      aircraftWidth,
      hullRatio:
        this.simState.playerHullIntegrity /
        this.simState.playerMaximumHullIntegrity,
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
