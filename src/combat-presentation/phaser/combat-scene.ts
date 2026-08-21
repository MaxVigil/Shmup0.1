import Phaser from 'phaser';
import type { CombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import type { CombatGeometry } from '../presentation-config/combat-config';
import { resolveCombatGeometry } from '../presentation-config/combat-config';

export interface CombatSceneContext {
  readonly geometry: CombatGeometry;
  readonly bridge: CombatHudBridge;
  /** Prepared `german-fighter` runtime URL, or `null` for the approved fallback. */
  readonly aircraftUrl: string | null;
  readonly initialHullRatio: number;
}

const AIRCRAFT_TEXTURE_KEY = 'aircraft';

/**
 * Combat Scene shell (S07): the solid-black approved canvas background, the
 * player aircraft structural placeholder at its geometry (`50% × 80%` of the
 * viewport, `12%` of the viewport short side, pointing upward), and the Hull
 * Integrity bar positioned through the CombatHudBridge. On viewport resize the
 * gameplay area and the aircraft/Hull geometry are recalculated from the new
 * short side while the current Hull ratio is retained (Combat §12.3, AC-057,
 * AC-081); the prepared texture is reused and never fetched again. Movement,
 * firing, enemies, and collision arrive in later slices; the render order
 * already follows the approved background–aircraft–Hull Bar sequence.
 */
export class CombatScene extends Phaser.Scene {
  private readonly context: CombatSceneContext;
  private geometry: CombatGeometry;
  private readonly hullRatio: number;
  private aircraftImage: Phaser.GameObjects.Image | null = null;
  private fallbackGraphics: Phaser.GameObjects.Graphics | null = null;
  private aircraftAspectRatio = 0;
  private aircraftLoadStarted = false;

  constructor(context: CombatSceneContext) {
    super({ key: 'combat' });
    this.context = context;
    this.geometry = context.geometry;
    this.hullRatio = context.initialHullRatio;
  }

  create(): void {
    // Guard for async aircraft decoding and the scale resize listener: the game
    // may be disposed while the prepared asset finishes loading or a resize
    // callback is pending, so Combat-owned callbacks must not dereference
    // Phaser objects after destruction (Repository Architecture §9 cleanup).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isShuttingDown = true;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.cameras.main.setBackgroundColor(this.geometry.backgroundColor);
    this.layoutAircraft();
  }

  private isShuttingDown = false;

  /** The rendered aircraft aspect ratio (image texture, or approved fallback). */
  private get renderedAircraftAspect(): number {
    return this.aircraftImage !== null
      ? this.aircraftAspectRatio
      : this.geometry.aircraftAspectRatio;
  }

  /**
   * Viewport resize contract (Combat §12.3, AC-001, AC-053, AC-057, AC-081,
   * MASTER-AC-010): the canvas follows the new gameplay area and the aircraft
   * is re-laid out at the approved `50% × 80%` centre with `12%` short-side
   * height, preserved aspect ratio, upward orientation, and complete visible
   * bounds; the Hull bar is recalculated from the resized aircraft while the
   * current Hull ratio is retained. The same prepared texture is reused.
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
    this.layoutAircraft();
  }

  private layoutAircraft(): void {
    if (this.aircraftImage === null && this.fallbackGraphics === null) {
      this.placeAircraft();
      return;
    }
    this.renderAircraft(
      this.geometry.viewportWidth * 0.5,
      this.geometry.viewportHeight * 0.8,
    );
  }

  private renderAircraft(centerX: number, centerY: number): void {
    const height = this.geometry.aircraftHeightPx;
    const width = height * this.renderedAircraftAspect;
    if (this.aircraftImage !== null) {
      this.aircraftImage.setPosition(centerX, centerY);
      this.aircraftImage.setDisplaySize(width, height);
    } else if (this.fallbackGraphics !== null) {
      this.redrawFallbackTriangle(centerX, centerY);
    }
    this.updateHud(centerX, centerY, width);
  }

  private placeAircraft(): void {
    if (this.aircraftLoadStarted) {
      return;
    }
    this.aircraftLoadStarted = true;
    const { aircraftUrl } = this.context;
    if (aircraftUrl === null) {
      this.fallbackGraphics = this.add.graphics();
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
        this.layoutAircraft();
        return;
      }
      this.aircraftAspectRatio = image.naturalWidth / image.naturalHeight;
      this.aircraftImage = this.add.image(0, 0, AIRCRAFT_TEXTURE_KEY);
      // Re-layout from the current geometry so a resize that raced the asset
      // load is honoured without re-fetching the prepared texture.
      this.layoutAircraft();
    };
    image.onerror = () => {
      if (!this.isShuttingDown) {
        this.fallbackGraphics = this.add.graphics();
        this.layoutAircraft();
      }
    };
    image.src = aircraftUrl;
  }

  /** Approved solid light-grey upward triangle fallback (Combat AC-056). */
  private redrawFallbackTriangle(centerX: number, centerY: number): void {
    const graphics = this.fallbackGraphics;
    if (graphics === null) {
      return;
    }
    const height = this.geometry.aircraftHeightPx;
    const width = height * this.geometry.aircraftAspectRatio;
    graphics.clear();
    graphics.fillStyle(hexToNumber(this.geometry.aircraftFallbackColor), 1);
    graphics.fillTriangle(
      centerX - width / 2,
      centerY + height / 2,
      centerX + width / 2,
      centerY + height / 2,
      centerX,
      centerY - height / 2,
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
