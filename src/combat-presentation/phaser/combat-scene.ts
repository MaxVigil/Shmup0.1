import Phaser from 'phaser';
import {
  routeKeyInput,
  shouldForwardPointerMove,
  type CombatEnemy,
  type CombatInputCommand,
  type CombatInputContext,
  type CombatSimulationState,
  type RoutedKeyIntent,
} from '@application/combat';
import type { PreparedRuntimeAsset } from '@application/ports';
import type { CombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import type { CombatGeometry } from '../presentation-config/combat-config';
import {
  COMBAT_RENDER_DEPTH,
  formatCombatCountdown,
  resolveCombatGeometry,
} from '../presentation-config/combat-config';
import {
  enemyVisualMappingFor,
  resolveEnemyVisual,
  type EnemyVisualKind,
  type EnemyVisualResolution,
  type FallbackPolygon,
} from '../presentation-config/enemy-visuals';
import type { EnemyType } from '@domain/index';

export interface CombatSceneContext {
  readonly geometry: CombatGeometry;
  readonly bridge: CombatHudBridge;
  /** Prepared `german-fighter` runtime URL, or `null` for the approved fallback. */
  readonly aircraftUrl: string | null;
  /** Prepared runtime assets for the per-role enemy visual resolution. */
  readonly preparedAssets: readonly PreparedRuntimeAsset[];
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
   *  lifetime, spawning, movement, hitbox, or escape. V02-WI-04: the map
   *  holds per-role rendered visuals (prepared image or procedural fallback). */
  private readonly enemyVisuals = new Map<
    number,
    Phaser.GameObjects.GameObject
  >();
  /** Per-role resolved prepared-or-fallback result, fixed for the session. */
  private readonly enemyVisualResolutions = new Map<
    EnemyVisualKind,
    EnemyVisualResolution
  >();
  /** True once the prepared texture for a kind is registered (no late swap). */
  private readonly enemyTexturesReady = new Set<EnemyVisualKind>();
  /** Read-only stable-ID visual map for enemy (Ranged) projectiles (v0.2 §9.2). */
  private readonly enemyProjectileVisuals = new Map<
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
      this.enemyProjectileVisuals.clear();
      this.aircraftFlashActive = false;
      this.removeCombatListeners();
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.registerCombatListeners();
    this.cameras.main.setBackgroundColor(this.geometry.backgroundColor);
    this.initEnemyVisualResolutions();
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
    this.syncEnemyProjectileVisuals();
    this.applyAircraftFlash();
  }

  /** Resolves the per-role prepared-or-fallback visual once for the session
   *  (V02-AC-025): the result is fixed when Boot settled; Combat never issues
   *  a second request or swaps a late fallback. */
  private initEnemyVisualResolutions(): void {
    for (const kind of REGULAR_VISUAL_KINDS) {
      this.enemyVisualResolutions.set(
        kind,
        resolveEnemyVisual(
          kind,
          this.context.preparedAssets,
          this.geometry.shortSide,
        ),
      );
    }
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
   * (V02-WI-04): each role renders its prepared image (once its texture is
   * registered) or its approved procedural fallback geometry, both sized to
   * the enemy's complete rendered bounds. Existing visuals are repositioned/
   * resized, and visuals whose id left the simulation are destroyed. Spawning,
   * movement, activation, hitbox, and escape remain application-owned; the
   * explicit `COMBAT_RENDER_DEPTH.enemy` layer keeps render order deterministic.
   */
  private syncEnemyVisuals(): void {
    if (this.isShuttingDown) {
      return;
    }
    const { enemies, activeEnemyFlashStepsRemaining } = this.simState;
    const seen = new Set<number>();
    for (const enemy of enemies) {
      seen.add(enemy.id);
      const kind = enemyVisualKindForType(enemy.type);
      const resolution = this.enemyVisualResolutions.get(kind);
      if (resolution === undefined) {
        continue;
      }
      const flashing = (activeEnemyFlashStepsRemaining[enemy.id] ?? 0) > 0;
      if (resolution.status === 'ready') {
        this.ensureEnemyTexture(kind, resolution);
        if (!this.enemyTexturesReady.has(kind)) {
          // The prepared texture is still decoding: render the stable fallback
          // geometry (the session resolution is already fixed to `ready`).
          this.upsertFallbackEnemyVisual(enemy, kind, flashing);
          continue;
        }
        this.upsertImageEnemyVisual(enemy, kind, flashing);
        continue;
      }
      this.upsertFallbackEnemyVisual(enemy, kind, flashing);
    }
    for (const [id, visual] of this.enemyVisuals) {
      if (!seen.has(id)) {
        visual.destroy();
        this.enemyVisuals.delete(id);
      }
    }
  }

  /** Registers the prepared enemy texture exactly once per kind when ready. */
  private ensureEnemyTexture(
    kind: EnemyVisualKind,
    resolution: Extract<EnemyVisualResolution, { readonly status: 'ready' }>,
  ): void {
    if (this.enemyTexturesReady.has(kind)) {
      return;
    }
    const key = enemyTextureKey(kind);
    if (this.textures.exists(key)) {
      this.enemyTexturesReady.add(kind);
      return;
    }
    const image = new Image();
    const onLoad = (): void => {
      if (this.isShuttingDown) {
        return;
      }
      if (this.textures.addImage(key, image) === null) {
        // Registration failure falls back to the approved procedural geometry
        // for the remainder of the session; no second request is issued.
        return;
      }
      this.enemyTexturesReady.add(kind);
    };
    image.onload = onLoad;
    image.onerror = () => {
      // The prepared URL failed after Boot settled: the fallback stays fixed.
    };
    image.src = resolution.url;
  }

  /** Renders one enemy as the prepared image (texture already registered). */
  private upsertImageEnemyVisual(
    enemy: CombatEnemy,
    kind: EnemyVisualKind,
    flashing: boolean,
  ): void {
    const key = enemyTextureKey(kind);
    const existing = this.enemyVisuals.get(enemy.id);
    if (
      existing !== undefined &&
      !(existing instanceof Phaser.GameObjects.Image)
    ) {
      existing.destroy();
      this.enemyVisuals.delete(enemy.id);
    }
    let visual = this.enemyVisuals.get(enemy.id) as
      Phaser.GameObjects.Image | undefined;
    if (visual === undefined) {
      visual = this.add.image(enemy.centerX, enemy.centerY, key);
      visual.setDepth(COMBAT_RENDER_DEPTH.enemy);
      this.enemyVisuals.set(enemy.id, visual);
    }
    visual.setPosition(enemy.centerX, enemy.centerY);
    visual.setDisplaySize(enemy.width, enemy.height);
    if (flashing) {
      visual.setTint(hexToNumber(this.geometry.enemyFlashColor));
    } else {
      visual.clearTint();
    }
  }

  /** Renders one enemy as its approved procedural fallback geometry. */
  private upsertFallbackEnemyVisual(
    enemy: CombatEnemy,
    kind: EnemyVisualKind,
    flashing: boolean,
  ): void {
    const existing = this.enemyVisuals.get(enemy.id);
    if (
      existing !== undefined &&
      !(existing instanceof Phaser.GameObjects.Graphics)
    ) {
      existing.destroy();
      this.enemyVisuals.delete(enemy.id);
    }
    let visual = this.enemyVisuals.get(enemy.id) as
      Phaser.GameObjects.Graphics | undefined;
    if (visual === undefined) {
      visual = this.add.graphics();
      visual.setDepth(COMBAT_RENDER_DEPTH.enemy);
      this.enemyVisuals.set(enemy.id, visual);
    }
    const resolution = this.enemyVisualResolutions.get(kind);
    const geometry =
      resolution?.status === 'ready' ? undefined : resolution?.geometry;
    visual.clear();
    if (geometry === undefined) {
      // A `ready` resolution whose texture is still decoding: draw the role's
      // fallback shapes from the mapping so the enemy is never invisible.
      this.drawFallbackShapes(
        visual,
        enemy,
        enemyVisualMappingShapes(kind),
        flashing,
      );
      return;
    }
    this.drawFallbackShapes(visual, enemy, geometry.shapes, flashing);
    visual.setPosition(enemy.centerX, enemy.centerY);
  }

  private drawFallbackShapes(
    graphics: Phaser.GameObjects.Graphics,
    enemy: CombatEnemy,
    shapes: readonly FallbackPolygon[],
    flashing: boolean,
  ): void {
    graphics.clear();
    graphics.setPosition(enemy.centerX, enemy.centerY);
    for (const shape of shapes) {
      const points: Phaser.Math.Vector2[] = shape.points.map(
        ([x, y]) => new Phaser.Math.Vector2(x * enemy.width, y * enemy.height),
      );
      graphics.fillStyle(
        hexToNumber(
          flashing
            ? this.geometry.enemyFlashColor
            : fallbackFillColor(shape.fill, this.geometry),
        ),
        1,
      );
      graphics.fillPoints(points, true);
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

  private syncEnemyProjectileVisuals(): void {
    if (this.isShuttingDown) {
      return;
    }
    const { enemyProjectiles } = this.simState;
    const seen = new Set<number>();
    for (const projectile of enemyProjectiles) {
      seen.add(projectile.id);
      let visual = this.enemyProjectileVisuals.get(projectile.id);
      if (visual === undefined) {
        // The Ranged projectile is a solid horizontal `danger` rectangle whose
        // complete bounds equal its authoritative AABB (v0.2 §9.2).
        visual = this.add.rectangle(
          projectile.centerX,
          projectile.centerY,
          projectile.width,
          projectile.height,
          hexToNumber(this.geometry.rangedProjectileColor),
        );
        visual.setDepth(COMBAT_RENDER_DEPTH.projectile);
        this.enemyProjectileVisuals.set(projectile.id, visual);
      } else {
        visual.setPosition(projectile.centerX, projectile.centerY);
        visual.setSize(projectile.width, projectile.height);
      }
    }
    for (const [id, visual] of this.enemyProjectileVisuals) {
      if (!seen.has(id)) {
        visual.destroy();
        this.enemyProjectileVisuals.delete(id);
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
    // V02-WI-04: the CombatHudBridge is updated from the authoritative player
    // Hull, Countdown, and Critical Hull state every rendered frame so the bar
    // width, fill, aria-valuenow, countdown text, and warning change in the
    // same frame as the simulation — without any React per-frame state.
    this.context.bridge.update({
      aircraftCenterX: centerX,
      aircraftBottomY: centerY + this.geometry.aircraftHeightPx / 2,
      aircraftWidth,
      hullRatio:
        this.simState.playerHullIntegrity /
        this.simState.playerMaximumHullIntegrity,
      // Strict-below-25 danger fill (v0.2 §15.3, DS §8.26): at 25 it is accent.
      hullDanger: this.simState.playerHullIntegrity < 25,
      viewportShortSide: this.geometry.shortSide,
      countdownText: formatCombatCountdown(this.simState.countdownSeconds),
      criticalHullVisible: this.simState.criticalHullMessageStepsRemaining > 0,
    });
  }
}

/** The three approved regular-enemy visual kinds consumed by V02-WI-04. */
const REGULAR_VISUAL_KINDS: readonly EnemyVisualKind[] = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
];

/** Maps the authoritative enemy type to its visual kind. */
function enemyVisualKindForType(type: EnemyType): EnemyVisualKind {
  if (type === 'basic-drone') {
    return 'basic-drone';
  }
  if (type === 'ranged-drone') {
    return 'ranged-drone';
  }
  return 'hunter-drone';
}

function enemyTextureKey(kind: EnemyVisualKind): string {
  return `enemy-visual-${kind}`;
}

/** Reads the approved fallback shape set for one kind (mapping owner). */
function enemyVisualMappingShapes(
  kind: EnemyVisualKind,
): readonly FallbackPolygon[] {
  return enemyVisualMappingFor(kind).fallback.shapes;
}

/** Resolves an approved fallback fill token to its rendered colour. */
function fallbackFillColor(
  fill: 'border-strong' | 'surface-raised' | 'accent',
  geometry: CombatGeometry,
): string {
  if (fill === 'border-strong') {
    return geometry.fallbackBorderStrongColor;
  }
  if (fill === 'surface-raised') {
    return geometry.fallbackSurfaceRaisedColor;
  }
  return geometry.fallbackAccentColor;
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
