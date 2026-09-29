/**
 * V02-WI-07 D04-C03 isolated real-renderer Combat rendering fixture.
 *
 * Development/test-only. It instantiates the REAL `CombatScene` with the real
 * installed Phaser engine, real WebGL or CANVAS contexts, the approved prepared
 * PNGs, the existing procedural fallback mapping, real geometry/tokens and
 * controlled immutable simulation snapshots. It exists so a browser test can
 * read the FINAL rendered pixels of a known state instead of asserting canvas
 * draw calls or hunting for a random gameplay hit.
 *
 * Boundaries:
 * - this page is reachable only from the Vite development server; nothing in the
 *   application imports it and the production build never emits it;
 * - it exposes a fixture-local `window` API for the rendering spec only; the
 *   player application keeps no mutation API, scenario, hook or fixture;
 * - it never drives player gameplay: every rendered state is an explicit
 *   immutable snapshot handed to `getSimulationState`.
 */
import {
  FIXED_STEP_SECONDS,
  applyDebugCommand,
  beginEvacuation,
  evacuationEnemyOpacity,
  stepCombatSimulation,
} from '@application/combat';
import type { CombatEnemy, CombatSimulationState } from '@application/combat';
import type { PreparedRuntimeAsset } from '@application/ports';
import { createCombatHudBridge } from '@combat-presentation/hud-bridge/combat-hud-bridge';
import { resolveCombatGeometry } from '@combat-presentation/presentation-config/combat-config';
import { enemyVisualKindForEnemy } from '@combat-presentation/presentation-config/enemy-visuals';
import {
  CombatScene,
  type CombatSceneContext,
} from '@combat-presentation/phaser/combat-scene';
import { createTestCombatState } from '@test-support/domain';
import type { TestMissionId } from '@test-support/domain/combat';
import Phaser from 'phaser';

const VIEWPORT = { width: 1280, height: 600 } as const;

/** Approved prepared runtime assets, fetched exactly as the application does. */
const PREPARED_ASSETS: readonly { id: string; path: string }[] = [
  { id: 'enemy-basic-drone', path: '/enemies/basic-drone.png' },
  { id: 'enemy-ranged-drone', path: '/enemies/ranged-drone.png' },
  { id: 'enemy-hunter-drone', path: '/enemies/hunter-drone.png' },
  {
    id: 'enemy-elite-drone-armoured',
    path: '/enemies/elite-drone-armoured.png',
  },
  {
    id: 'enemy-elite-drone-vulnerable',
    path: '/enemies/elite-drone-vulnerable.png',
  },
];

interface SnapshotFacts {
  readonly name: string;
  readonly enemies: readonly {
    readonly id: number;
    readonly kind: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
    readonly visualKind: string;
    readonly flashing: boolean;
  }[];
  readonly exitOpacity: number;
  readonly elitePhase: string | null;
  readonly deflectionRecords: readonly number[];
  readonly preparedAssets: number;
}

interface RenderFacts extends SnapshotFacts {
  readonly rendererType: string;
  readonly requestedRenderer: string;
  readonly frames: number;
  readonly visuals: readonly {
    readonly id: number;
    readonly type: string;
    readonly textureKey: string;
  }[];
  /** The real game canvas rectangle in page coordinates (pixel sampling box). */
  readonly canvasRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

interface Wi07Fixture {
  readonly status: 'booting' | 'ready' | 'failed';
  readonly error: string | null;
  readonly requestedRenderer: string;
  readonly assetMode: string;
  readonly rendererType: string;
  readonly snapshots: readonly string[];
  readonly canvasRect: () => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  readonly apply: (name: string) => Promise<RenderFacts>;
}

declare global {
  interface Window {
    __wi07Fixture?: Wi07Fixture;
  }
}

function requestedRenderer(): 'webgl' | 'canvas' {
  const value = new URLSearchParams(window.location.search).get('renderer');
  return value === 'canvas' ? 'canvas' : 'webgl';
}

function assetMode(): 'prepared' | 'fallback' {
  const value = new URLSearchParams(window.location.search).get('assets');
  return value === 'fallback' ? 'fallback' : 'prepared';
}

/** Drives the real fixed-step simulation until one authoritative condition holds. */
function runMission(
  missionId: TestMissionId,
  steps: number,
  predicate: (state: CombatSimulationState) => boolean,
  maxSteps = 3000,
): CombatSimulationState {
  let state = applyDebugCommand(createTestCombatState({ missionId }), {
    type: 'combat-debug/god-mode',
    enabled: true,
  });
  for (let step = 0; step < steps; step += 1) {
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
  }
  for (let step = 0; step < maxSteps; step += 1) {
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    if (predicate(state)) {
      return state;
    }
  }
  throw new Error(`Fixture failed: condition never reached for ${missionId}.`);
}

/** Isolates ONE authoritative enemy plus explicitly chosen feedback state. */
function isolateEnemy(
  state: CombatSimulationState,
  enemy: CombatEnemy,
  extra: Partial<CombatSimulationState> = {},
): CombatSimulationState {
  return {
    ...state,
    enemies: [enemy],
    projectiles: [],
    enemyProjectiles: [],
    destroyedEnemyFlashes: [],
    eliteDeflectionFeedbacks: {},
    activeEnemyFlashStepsRemaining: {},
    ...extra,
  };
}

async function toDataUri(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Fixture failed to fetch ${path}: ${response.status}`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Fixture failed to read ${path}`));
    reader.readAsDataURL(blob);
  });
}

async function loadPreparedAssets(): Promise<PreparedRuntimeAsset[]> {
  const assets: PreparedRuntimeAsset[] = [];
  for (const entry of PREPARED_ASSETS) {
    assets.push({
      id: entry.id,
      kind: 'enemy-image',
      sourcePath: `assets/runtime${entry.path}`,
      url: entry.path,
      imageDataUri: await toDataUri(entry.path),
      status: 'ready',
    });
  }
  return assets;
}

/** Builds the controlled immutable snapshot catalogue (asset-mode independent). */
function buildSnapshots(): Map<string, CombatSimulationState> {
  const snapshots = new Map<string, CombatSimulationState>();

  // --- prepared damaging-hit feedback on a Basic Drone (Mission 01) ----------
  const basicState = runMission('interception-01', 600, (state) =>
    state.enemies.some((enemy) => enemy.kind === 'basic'),
  );
  const basic = basicState.enemies.find((enemy) => enemy.kind === 'basic');
  if (basic === undefined) {
    throw new Error('Fixture failed: no Basic Drone observed.');
  }
  // The SAME enemy at the SAME position for the whole flash sequence, so the
  // before/3/2/1/zero rasters are directly comparable.
  const pinnedBasic: CombatEnemy = { ...basic, centerX: 300, centerY: 200 };
  snapshots.set('basic-idle', isolateEnemy(basicState, pinnedBasic));
  for (const steps of [3, 2, 1, 0]) {
    snapshots.set(
      `basic-flash-${steps}`,
      isolateEnemy(basicState, pinnedBasic, {
        activeEnemyFlashStepsRemaining: { [pinnedBasic.id]: steps },
      }),
    );
  }
  snapshots.set(
    'basic-flash-repeat-2',
    isolateEnemy(basicState, pinnedBasic, {
      activeEnemyFlashStepsRemaining: { [pinnedBasic.id]: 2 },
    }),
  );

  // --- the Elite in both authoritative phases (Mission 03) -------------------
  const eliteIn = (
    state: CombatSimulationState,
  ): (CombatEnemy & { phase?: string }) | undefined =>
    state.enemies.find((enemy) => enemy.kind === 'elite');
  // One mission run captures both authoritative phases (the authored cycle
  // reaches Armoured before Vulnerable and repeats it).
  let eliteRun = applyDebugCommand(
    createTestCombatState({ missionId: 'interception-03' }),
    { type: 'combat-debug/god-mode', enabled: true },
  );
  for (let step = 0; step < 320 * 60; step += 1) {
    eliteRun = stepCombatSimulation(eliteRun, FIXED_STEP_SECONDS);
  }
  let eliteSource: CombatSimulationState | null = null;
  let vulnerableSource: CombatSimulationState | null = null;
  for (let step = 0; step < 4000; step += 1) {
    eliteRun = stepCombatSimulation(eliteRun, FIXED_STEP_SECONDS);
    if (eliteSource === null && eliteIn(eliteRun)?.phase === 'armoured') {
      eliteSource = eliteRun;
    }
    if (
      vulnerableSource === null &&
      eliteIn(eliteRun)?.phase === 'vulnerable'
    ) {
      vulnerableSource = eliteRun;
      break;
    }
  }
  const armouredElite = eliteSource === null ? undefined : eliteIn(eliteSource);
  const vulnerableElite =
    vulnerableSource === null ? undefined : eliteIn(vulnerableSource);
  if (
    eliteSource === null ||
    vulnerableSource === null ||
    armouredElite === undefined ||
    vulnerableElite === undefined
  ) {
    throw new Error('Fixture failed: the Elite states were not reached.');
  }
  const pinnedVulnerable: CombatEnemy = {
    ...vulnerableElite,
    centerX: 640,
    centerY: 120,
  };
  const pinnedArmoured: CombatEnemy = {
    ...armouredElite,
    centerX: 640,
    centerY: 120,
  };
  snapshots.set(
    'elite-vulnerable-idle',
    isolateEnemy(vulnerableSource, pinnedVulnerable),
  );
  for (const steps of [3, 2, 1, 0]) {
    snapshots.set(
      `elite-vulnerable-flash-${steps}`,
      isolateEnemy(vulnerableSource, pinnedVulnerable, {
        activeEnemyFlashStepsRemaining: { [pinnedVulnerable.id]: steps },
      }),
    );
  }
  snapshots.set(
    'elite-armoured-idle',
    isolateEnemy(eliteSource, pinnedArmoured),
  );
  snapshots.set(
    'elite-armoured-deflection',
    isolateEnemy(eliteSource, pinnedArmoured, {
      eliteDeflectionFeedbacks: {
        [pinnedArmoured.id]: {
          enemyId: pinnedArmoured.id,
          impactCenterX: pinnedArmoured.centerX,
          impactCenterY: pinnedArmoured.centerY + 20,
          stepsRemaining: 3,
        },
      },
    }),
  );

  // --- authoritative exit fade during a committed Evacuation -----------------
  // The base state keeps the Elite alive, so the committed evacuation (not a
  // natural Success) resolves the mission and starts the 30-step centre fade.
  let evacuation = beginEvacuation(eliteSource);
  let centreState: CombatSimulationState | null = null;
  for (let step = 0; step < 900; step += 1) {
    evacuation = stepCombatSimulation(evacuation, FIXED_STEP_SECONDS);
    if (
      evacuation.terminalResult?.kind === 'evacuated' &&
      evacuation.exitPhase === 'centre'
    ) {
      centreState = evacuation;
      break;
    }
  }
  if (centreState === null) {
    throw new Error(
      `Fixture failed: the committed Evacuation centre state was not reached (terminal=${String(
        evacuation.terminalResult?.kind ?? 'none',
      )}, exitPhase=${evacuation.exitPhase}).`,
    );
  }
  // The committed exit is authorized by the presentation when the player
  // confirms the terminal outcome (`authorizeCommittedExit`), and the authored
  // 30-step centre fade then decrements inside executed fixed steps (both already
  // covered by the accepted Combat tests). This fixture pins that documented
  // authorisation and a mid-fade count so the renderer's existing exit-opacity
  // application can be observed on the whitened silhouette.
  evacuation = {
    ...centreState,
    exitAuthorized: true,
    exitCentreStepsRemaining: 15,
  };
  snapshots.set(
    'elite-vulnerable-flash-3-exit-fade',
    isolateEnemy(evacuation, pinnedVulnerable, {
      activeEnemyFlashStepsRemaining: { [pinnedVulnerable.id]: 3 },
    }),
  );
  return snapshots;
}

interface SceneInternals {
  readonly enemyVisuals: Map<number, unknown>;
  readonly enemyTextureStates: Map<string, string>;
  simState: CombatSimulationState;
}

async function boot(): Promise<void> {
  const renderer = requestedRenderer();
  const mode = assetMode();
  const preparedAssets = mode === 'prepared' ? await loadPreparedAssets() : [];
  const snapshots = buildSnapshots();
  const container = document.getElementById('stage');
  if (container === null) {
    throw new Error('Fixture failed: the #stage container is missing.');
  }
  const bridge = createCombatHudBridge();
  container.appendChild(bridge.element);
  const geometry = resolveCombatGeometry(VIEWPORT);
  const initial = snapshots.get('basic-idle');
  if (initial === undefined) {
    throw new Error('Fixture failed: the basic-idle snapshot is missing.');
  }
  const holder: { state: CombatSimulationState } = { state: initial };
  const context: CombatSceneContext = {
    geometry,
    bridge,
    aircraftUrl: null,
    preparedAssets,
    submitCommand: () => {},
    advanceFrame: () => holder.state,
    getSimulationState: () => holder.state,
    getPaused: () => false,
    requestPause: () => {},
  };
  class BoundCombatScene extends CombatScene {
    constructor() {
      super(context);
    }
  }
  const game = new Phaser.Game({
    type: renderer === 'canvas' ? Phaser.CANVAS : Phaser.WEBGL,
    parent: container,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    banner: false,
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    scene: [BoundCombatScene],
  });

  const sceneOf = (): SceneInternals | null => {
    const scene = game.scene.getScene('combat');
    return scene === null || scene === undefined
      ? null
      : (scene as unknown as SceneInternals);
  };
  const waitForRenders = (count: number): Promise<void> =>
    new Promise((resolve) => {
      let seen = 0;
      const handler = (): void => {
        seen += 1;
        if (seen >= count) {
          game.events.off(Phaser.Core.Events.POST_RENDER, handler);
          resolve();
        }
      };
      game.events.on(Phaser.Core.Events.POST_RENDER, handler);
    });

  // Wait for the real scene to boot, and in prepared mode for the prepared
  // textures to be decoded and registered, so the pixel reads observe the same
  // presentation path the production build uses.
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const scene = sceneOf();
    if (scene !== null && scene.enemyVisuals.size > 0) {
      const kinds = ['basic-drone', 'elite-drone-vulnerable'];
      if (
        mode === 'fallback' ||
        kinds.every((kind) => scene.enemyTextureStates.get(kind) === 'ready')
      ) {
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const collectFacts = (
    name: string,
    snapshot: CombatSimulationState,
  ): RenderFacts => {
    const scene = sceneOf();
    const visuals: { id: number; type: string; textureKey: string }[] = [];
    for (const [id, visual] of scene?.enemyVisuals ?? []) {
      const candidate = visual as { type?: string; texture?: { key?: string } };
      visuals.push({
        id,
        type: candidate.type ?? 'unknown',
        textureKey: candidate.texture?.key ?? 'none',
      });
    }
    const rect = game.canvas.getBoundingClientRect();
    return {
      name,
      rendererType: game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
      requestedRenderer: renderer,
      frames: game.loop.frame,
      enemies: snapshot.enemies.map((enemy) => ({
        id: enemy.id,
        kind: enemy.kind,
        centerX: enemy.centerX,
        centerY: enemy.centerY,
        width: enemy.width,
        height: enemy.height,
        visualKind: enemyVisualKindForEnemy({
          type: enemy.type,
          elitePhase:
            enemy.kind === 'elite'
              ? ((enemy as CombatEnemy & { phase?: 'armoured' | 'vulnerable' })
                  .phase ?? null)
              : null,
        }),
        flashing: (snapshot.activeEnemyFlashStepsRemaining[enemy.id] ?? 0) > 0,
      })),
      exitOpacity: evacuationEnemyOpacity(snapshot),
      elitePhase:
        (
          snapshot.enemies.find((enemy) => enemy.kind === 'elite') as
            (CombatEnemy & { phase?: string }) | undefined
        )?.phase ?? null,
      deflectionRecords: Object.keys(snapshot.eliteDeflectionFeedbacks).map(
        Number,
      ),
      preparedAssets: preparedAssets.length,
      visuals,
      canvasRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  };

  window.__wi07Fixture = {
    status: 'ready',
    error: null,
    requestedRenderer: renderer,
    assetMode: mode,
    rendererType: game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
    snapshots: [...snapshots.keys()],
    canvasRect: () => {
      const rect = game.canvas.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
    apply: async (name: string): Promise<RenderFacts> => {
      const snapshot = snapshots.get(name);
      if (snapshot === undefined) {
        throw new Error(`Fixture: unknown snapshot ${name}`);
      }
      holder.state = snapshot;
      // Two completed engine renders after the swap; the state that is read is
      // the one the second completed render drew.
      await waitForRenders(2);
      return collectFacts(name, snapshot);
    },
  };
}

boot().catch((error: unknown) => {
  window.__wi07Fixture = {
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
    requestedRenderer: requestedRenderer(),
    assetMode: assetMode(),
    rendererType: 'unknown',
    snapshots: [],
    canvasRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    apply: async () => {
      throw new Error('Fixture failed to boot.');
    },
  };
});
