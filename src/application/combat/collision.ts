import { overlaps } from '@domain/geometry';
import type { EnemyType } from '@domain/index';
import {
  eliteAcceptsProjectileDamage,
  isEliteProjectileTargetEligible,
} from './enemies';
import type { CombatEnemy } from './enemies';
import type { CombatProjectile, EnemyProjectile } from './projectiles';
import {
  aircraftCollisionAabb,
  enemyCollisionAabb,
  enemyProjectileCollisionAabb,
  projectileCollisionAabb,
} from './collision-geometry';
import { EVIDENCE_COUNTERS_ENABLED } from './evidence';
import type { CollisionEvidenceSink } from './evidence';

/**
 * V02-WI-04 deterministic collision phase (Epic §11, V02-AC-008/011–013;
 * v0.2 replaces the v0.1 contact rules). One explicit phase runs after
 * movement, spawning, and firing per executed 1/60 s step:
 *
 * 1. player-projectile → enemy pairs (ascending ids; single-hit lifecycle);
 * 2. enemy-projectile → Aircraft pairs (single-hit lifecycle, v0.2 §9.2/§10);
 * 3. Aircraft → surviving-enemy contact pairs (Epic §11.1–11.2).
 *
 * Regular (Basic/Ranged) contact damages the Aircraft by the role's contact
 * damage and does NOT damage or destroy the enemy; the same pair applies
 * contact damage at most once per `0.75 s` (per-pair cooldown). Hunter contact
 * is the kamikaze exception: 35 damage, the Hunter is destroyed, and zero
 * reward is granted. Defeat has priority over Success within the step.
 * Presentation-only feedback (hit flashes) never delays gameplay transitions.
 *
 * V02-WI-06 E01 adds the explicit Elite resolution (Epic §9.4, V02-AC-009):
 * a hit on an `Armoured` Elite deals zero, preserves its Hull, and still
 * consumes exactly that projectile while creating/restarting this Elite's
 * dedicated local deflection-feedback record at the blocking projectile's
 * authoritative centre; it never sets the generic full-craft enemy flash.
 * Only a `Vulnerable` hit applies the player projectile damage through the
 * unchanged regular hit path, and destruction stays terminal and idempotent
 * for the rest of the step. V02-WI-06 E01 C01 additionally treats an
 * `entering` Elite as not eligible at all (no damage, no consumption, no
 * feedback) so the projectile may still resolve against the next eligible
 * overlapping enemy in stable ascending-id order.
 */

/** Player-only regular per-pair contact cooldown: 0.75 s = 45 fixed steps. */
export const PAIR_CONTACT_COOLDOWN_STEPS = 45;
/** Non-destroying enemy hit flash: 50 ms = 3 fixed steps. */
export const ENEMY_HIT_FLASH_STEPS = 3;
/** Destroyed-enemy flash: 100 ms = 6 fixed steps, hitbox-free and stationary. */
export const DESTROYED_ENEMY_FLASH_STEPS = 6;
/** Player aircraft danger flash after valid damage: 100 ms = 6 fixed steps. */
export const AIRCRAFT_DAMAGE_FLASH_STEPS = 6;

/**
 * V02-WI-06 E01 C01 authoritative local Elite deflection-feedback record
 * (Epic §9.4): a blocked `Armoured` hit is communicated by one short local
 * deflection at the valid impact location, never by a full-craft flash. The
 * record carries the Elite id, the blocking projectile's authoritative centre
 * at the collision step (the local impact centre), and exactly
 * `ENEMY_HIT_FLASH_STEPS` remaining executed steps. A later blocked hit
 * replaces (restarts) that Elite's single record; the record decays once per
 * executed step and is removed at zero or when the Elite is destroyed.
 * E01 owns this authoritative data only — rendering it is E03-owned.
 */
export interface EliteDeflectionFeedback {
  readonly enemyId: number;
  /** Blocking projectile's authoritative centre at the collision step. */
  readonly impactCenterX: number;
  readonly impactCenterY: number;
  readonly stepsRemaining: number;
}

/** Live Elite deflection records keyed by Elite id (one authored Elite). */
export type EliteDeflectionFeedbacks = Readonly<
  Record<number, EliteDeflectionFeedback>
>;

export interface DestroyedEnemyFlash {
  readonly enemyId: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly size: number;
  readonly stepsRemaining: number;
}

/** Active-enemy white-flash counters keyed by enemy id. */
export type EnemyFlashSteps = Readonly<Record<number, number>>;

/** One enemy destroyed in the collision phase (reward/count owners). */
export interface DestroyedEnemyInfo {
  readonly id: number;
  readonly type: EnemyType;
}

export interface ProjectileCollisionInput {
  readonly projectiles: readonly CombatProjectile[];
  readonly enemies: readonly CombatEnemy[];
  readonly projectileWidth: number;
  readonly projectileHeight: number;
  readonly existingFlashes: EnemyFlashSteps;
  /**
   * V02-WI-06 E01 C01 live Elite deflection records to carry forward. Optional
   * for the existing regular-only callers (`combat-collision.test.ts`), which
   * have no Elite; the production simulation always supplies its authoritative
   * `eliteDeflectionFeedbacks` state.
   */
  readonly existingEliteDeflections?: EliteDeflectionFeedbacks;
  /** Evidence-only read-only work sink (Pass A; absent from the ordinary build). */
  readonly evidence?: CollisionEvidenceSink;
}

export interface ProjectileCollisionResult {
  readonly projectiles: readonly CombatProjectile[];
  readonly enemies: readonly CombatEnemy[];
  readonly destroyedEnemies: readonly DestroyedEnemyInfo[];
  readonly flashes: EnemyFlashSteps;
  readonly eliteDeflections: EliteDeflectionFeedbacks;
  readonly destroyedEnemyFlashes: readonly DestroyedEnemyFlash[];
}

/**
 * Player-projectile → enemy pass (Combat §8.4; v0.2 §10 single-hit lifecycle):
 * projectile ids ascending; each projectile damages only the first overlapping
 * still-active eligible enemy by ascending enemy id and is consumed exactly
 * once. An enemy reaching Hull <= 0 immediately leaves the active collection,
 * is reported exactly once (the simulation owns reward/count), and creates only
 * the 100 ms hitbox-free destruction flash; later projectiles in the same step
 * ignore it. A non-destroying hit applies or restarts that enemy's 50 ms flash
 * and preserves movement and hitbox. Enemy hulls are reduced only by
 * projectiles — regular contact never damages an enemy (Epic §11.1).
 *
 * Elite rules (Epic §9.4, V02-AC-009; V02-WI-06 E01 C01):
 * - an `Armoured` hit is blocked: zero damage, Hull preserved, exactly that
 *   projectile consumed, and the dedicated local deflection record created or
 *   replaced at the blocking projectile's centre — the generic full-craft
 *   `flashes` map is deliberately NOT written;
 * - a `Vulnerable` hit keeps the unchanged normal-damage/full-hit-feedback path;
 * - an `entering` Elite is not an eligible target in E01 (no damage, no
 *   consumption, no feedback) and is skipped so a later eligible overlapping
 *   enemy can be hit in the same step.
 */
export function resolveProjectileCollisions(
  input: ProjectileCollisionInput,
): ProjectileCollisionResult {
  const sortedEnemies = [...input.enemies].sort((a, b) => a.id - b.id);
  const hullByEnemyId = new Map(
    input.enemies.map((enemy) => [enemy.id, enemy.hullIntegrity] as const),
  );
  const destroyedIds = new Set<number>();
  const survivingProjectileIds = new Set<number>();
  const flashes: Record<number, number> = { ...input.existingFlashes };
  const eliteDeflections: Record<number, EliteDeflectionFeedback> = {
    ...input.existingEliteDeflections,
  };
  const destroyedEnemies: DestroyedEnemyInfo[] = [];
  const destroyedEnemyFlashes: DestroyedEnemyFlash[] = [];
  // V02-WI-04 C03 evidence-only observed work counters (Pass A): candidates are
  // the (projectile, enemy) pairs actually enumerated; intersections are the
  // pairs that actually overlapped. The counters are eliminated from the
  // ordinary production artifact through the counters gate.
  let evidenceCandidates = 0;
  let evidenceIntersections = 0;

  for (const projectile of input.projectiles) {
    if (destroyedIds.size === sortedEnemies.length) {
      // Every remaining enemy is already destroyed; later projectiles fly free.
      survivingProjectileIds.add(projectile.id);
      continue;
    }
    let hitId: number | null = null;
    for (const enemy of sortedEnemies) {
      if (destroyedIds.has(enemy.id)) {
        continue;
      }
      // V02-WI-06 E01 C01: an `entering` Elite is not eligible at all, so the
      // stable ascending-id search continues to the next eligible target.
      if (enemy.kind === 'elite' && !isEliteProjectileTargetEligible(enemy)) {
        continue;
      }
      if (EVIDENCE_COUNTERS_ENABLED) {
        evidenceCandidates += 1;
      }
      const hit = overlaps(
        projectileCollisionAabb(
          projectile,
          input.projectileWidth,
          input.projectileHeight,
        ),
        enemyCollisionAabb(enemy),
      );
      if (EVIDENCE_COUNTERS_ENABLED && hit) {
        evidenceIntersections += 1;
      }
      if (hit) {
        hitId = enemy.id;
        break;
      }
    }
    if (hitId === null) {
      survivingProjectileIds.add(projectile.id);
      continue;
    }
    const target = sortedEnemies.find((enemy) => enemy.id === hitId);
    if (
      target !== undefined &&
      target.kind === 'elite' &&
      !eliteAcceptsProjectileDamage(target)
    ) {
      // Blocked Armoured hit (Epic §9.4, V02-AC-009; V02-WI-06 E01 C01):
      // exactly this projectile is consumed and the Elite Hull/phase are
      // preserved, while the hit is communicated ONLY through this Elite's
      // dedicated local deflection record created (or replaced) at the blocking
      // projectile's authoritative centre for the collision step. The generic
      // full-craft enemy flash map is deliberately not written, and no Hull,
      // phase, movement, aircraft-damage, or destroyed-flash effect is added.
      eliteDeflections[hitId] = {
        enemyId: hitId,
        impactCenterX: projectile.centerX,
        impactCenterY: projectile.centerY,
        stepsRemaining: ENEMY_HIT_FLASH_STEPS,
      };
      continue;
    }
    // The projectile is consumed by its first valid hit (single-hit lifecycle).
    const currentHull = hullByEnemyId.get(hitId) ?? 0;
    const nextHull = currentHull - projectile.damage;
    hullByEnemyId.set(hitId, nextHull);
    if (nextHull <= 0) {
      destroyedIds.add(hitId);
      const enemy = sortedEnemies.find((candidate) => candidate.id === hitId);
      if (enemy !== undefined) {
        destroyedEnemies.push({ id: enemy.id, type: enemy.type });
        destroyedEnemyFlashes.push({
          enemyId: enemy.id,
          centerX: enemy.centerX,
          centerY: enemy.centerY,
          size: Math.max(enemy.width, enemy.height),
          stepsRemaining: DESTROYED_ENEMY_FLASH_STEPS,
        });
      }
    } else {
      flashes[hitId] = ENEMY_HIT_FLASH_STEPS;
    }
  }
  if (EVIDENCE_COUNTERS_ENABLED && input.evidence !== undefined) {
    input.evidence.addPlayerProjectileCandidates(evidenceCandidates);
    input.evidence.addPlayerProjectileIntersections(evidenceIntersections);
  }

  const enemies = input.enemies
    .filter((enemy) => !destroyedIds.has(enemy.id))
    .map((enemy) => ({
      ...enemy,
      hullIntegrity: hullByEnemyId.get(enemy.id) ?? enemy.hullIntegrity,
    }));
  const projectiles = input.projectiles.filter((projectile) =>
    survivingProjectileIds.has(projectile.id),
  );
  // A destroyed Elite owns no feedback record, and a zero-step record is not
  // live: both are removed here so the authoritative state never carries a
  // deflection for an Elite that is gone (Epic §9.4, V02-WI-06 E01 C01).
  const liveEliteDeflections: Record<number, EliteDeflectionFeedback> = {};
  for (const [id, record] of Object.entries(eliteDeflections)) {
    const enemyId = Number(id);
    if (destroyedIds.has(enemyId) || record.stepsRemaining <= 0) {
      continue;
    }
    liveEliteDeflections[enemyId] = record;
  }
  return {
    projectiles,
    enemies,
    destroyedEnemies,
    flashes,
    eliteDeflections: liveEliteDeflections,
    destroyedEnemyFlashes,
  };
}

export interface EnemyProjectileCollisionInput {
  readonly projectiles: readonly EnemyProjectile[];
  readonly aircraftCenterX: number;
  readonly aircraftCenterY: number;
  readonly aircraftWidth: number;
  readonly aircraftHeight: number;
  readonly playerHullIntegrity: number;
  readonly playerMaximumHullIntegrity: number;
  readonly godModeEnabled: boolean;
  readonly playerDefeated: boolean;
  /** Evidence-only read-only work sink (Pass A; absent from the ordinary build). */
  readonly evidence?: CollisionEvidenceSink;
}

export interface EnemyProjectileCollisionResult {
  readonly projectiles: readonly EnemyProjectile[];
  readonly playerHullIntegrity: number;
  readonly playerDefeated: boolean;
  readonly aircraftDangerFlashStepsRemaining: number;
  /** True when at least one enemy projectile was consumed by a valid hit. */
  readonly hitCount: number;
}

/**
 * Enemy-projectile → Aircraft pass (v0.2 §9.2/§10): ascending projectile ids;
 * each projectile is removed on its first valid Aircraft hit; the Aircraft
 * takes the projectile damage once (God Mode keeps Hull at maximum). Any
 * remaining projectile continues until complete-viewport exit.
 */
export function resolveEnemyProjectileCollisions(
  input: EnemyProjectileCollisionInput,
): EnemyProjectileCollisionResult {
  if (input.playerDefeated || input.projectiles.length === 0) {
    return {
      projectiles: input.projectiles,
      playerHullIntegrity: input.playerHullIntegrity,
      playerDefeated: input.playerDefeated,
      aircraftDangerFlashStepsRemaining: 0,
      hitCount: 0,
    };
  }
  const aircraftBox = aircraftCollisionAabb(
    input.aircraftCenterX,
    input.aircraftCenterY,
    input.aircraftWidth,
    input.aircraftHeight,
  );
  let hull = input.playerHullIntegrity;
  let defeated: boolean = input.playerDefeated;
  let flash = 0;
  let hitCount = 0;
  // V02-WI-04 C03 evidence-only observed work counters (Pass A).
  let evidenceCandidates = 0;
  let evidenceIntersections = 0;
  const remaining: EnemyProjectile[] = [];
  for (const projectile of input.projectiles) {
    if (EVIDENCE_COUNTERS_ENABLED) {
      evidenceCandidates += 1;
    }
    if (overlaps(aircraftBox, enemyProjectileCollisionAabb(projectile))) {
      hitCount += 1;
      if (EVIDENCE_COUNTERS_ENABLED) {
        evidenceIntersections += 1;
      }
      if (input.godModeEnabled) {
        hull = input.playerMaximumHullIntegrity;
      } else {
        hull = Math.max(0, hull - projectile.damage);
        flash = AIRCRAFT_DAMAGE_FLASH_STEPS;
        if (hull <= 0) {
          defeated = true;
        }
      }
      continue; // consumed by its first valid hit
    }
    remaining.push(projectile);
  }
  if (EVIDENCE_COUNTERS_ENABLED && input.evidence !== undefined) {
    input.evidence.addEnemyProjectileCandidates(evidenceCandidates);
    input.evidence.addEnemyProjectileIntersections(evidenceIntersections);
  }
  return {
    projectiles: remaining,
    playerHullIntegrity: hull,
    playerDefeated: defeated,
    aircraftDangerFlashStepsRemaining: flash,
    hitCount,
  };
}

export interface ContactCollisionInput {
  readonly enemies: readonly CombatEnemy[];
  readonly aircraftCenterX: number;
  readonly aircraftCenterY: number;
  readonly aircraftWidth: number;
  readonly aircraftHeight: number;
  readonly playerHullIntegrity: number;
  readonly playerMaximumHullIntegrity: number;
  /** Per-pair cooldown: enemy id → remaining fixed steps (Epic §11.1). */
  readonly pairContactCooldownSteps: Readonly<Record<number, number>>;
  /** Role contact damage: enemy type → damage value (Epic §9 table). */
  readonly contactDamageByType: Readonly<Record<EnemyType, number>>;
  readonly aircraftDangerFlashStepsRemaining: number;
  readonly godModeEnabled: boolean;
  readonly playerDefeated: boolean;
  /** Evidence-only read-only work sink (Pass A; absent from the ordinary build). */
  readonly evidence?: CollisionEvidenceSink;
}

export interface ContactCollisionResult {
  readonly enemies: readonly CombatEnemy[];
  readonly playerHullIntegrity: number;
  readonly playerDefeated: boolean;
  readonly pairContactCooldownSteps: Readonly<Record<number, number>>;
  readonly aircraftDangerFlashStepsRemaining: number;
  /** Hunters destroyed through kamikaze contact (zero reward, Epic §11.2). */
  readonly destroyedByContact: readonly DestroyedEnemyInfo[];
  readonly destroyedEnemyFlashes: readonly DestroyedEnemyFlash[];
}

/**
 * Aircraft-to-surviving-enemy contact pass (Epic §11.1–11.3), ascending enemy
 * id. Basic/Ranged contact applies the role contact damage to the Aircraft and
 * starts that exact pair's 0.75 s cooldown; the enemy survives (regular
 * contact never damages enemies). Hunter contact is the kamikaze exception:
 * it damages the Aircraft, destroys the Hunter, and grants zero reward; the
 * regular pair cooldown never converts Hunter contact into persistent overlap.
 * God Mode keeps Hull at maximum while contact outcomes still resolve.
 *
 * V02-WI-06 E01 C01: the Elite is excluded from this pass entirely. Epic §11.1
 * defines regular contact for Basic/Ranged and §11.2 defines the Hunter
 * exception; no Elite contact outcome is approved, so an overlapping Elite
 * produces NO contact side effect at all — no Aircraft damage, no Aircraft
 * damage flash, no pair cooldown, no enemy destruction, and no reward/count or
 * other accounting entry. The eventual Elite/Aircraft contact rule is outside
 * E01 and requires canonical closure before player-facing integration.
 */
export function resolveAircraftContacts(
  input: ContactCollisionInput,
): ContactCollisionResult {
  const aircraftBox = aircraftCollisionAabb(
    input.aircraftCenterX,
    input.aircraftCenterY,
    input.aircraftWidth,
    input.aircraftHeight,
  );
  let playerHull = input.playerHullIntegrity;
  let defeated = input.playerDefeated;
  let aircraftFlash = input.aircraftDangerFlashStepsRemaining;
  const cooldowns: Record<number, number> = {
    ...input.pairContactCooldownSteps,
  };
  const destroyedByContact: DestroyedEnemyInfo[] = [];
  const destroyedEnemyFlashes: DestroyedEnemyFlash[] = [];
  const sorted = [...input.enemies].sort((a, b) => a.id - b.id);
  // V02-WI-04 C03 evidence-only observed work counters (Pass A).
  let evidenceCandidates = 0;
  let evidenceIntersections = 0;
  for (const enemy of sorted) {
    if (defeated) {
      break;
    }
    if (enemy.kind === 'elite') {
      // V02-WI-06 E01 C01: no approved Elite contact outcome exists, so the
      // Elite is not a contact participant and never reaches the regular or
      // Hunter branches (no damage, flash, cooldown, destruction, or reward).
      continue;
    }
    if (EVIDENCE_COUNTERS_ENABLED) {
      evidenceCandidates += 1;
    }
    if (!overlaps(aircraftBox, enemyCollisionAabb(enemy))) {
      continue;
    }
    if (EVIDENCE_COUNTERS_ENABLED) {
      evidenceIntersections += 1;
    }
    if (input.godModeEnabled) {
      playerHull = input.playerMaximumHullIntegrity;
    }
    if (enemy.kind === 'hunter') {
      // Kamikaze exception (Epic §9.3/§11.2): damage, destroy, zero reward.
      if (!input.godModeEnabled) {
        playerHull = Math.max(0, playerHull - 35);
        aircraftFlash = AIRCRAFT_DAMAGE_FLASH_STEPS;
        if (playerHull <= 0) {
          defeated = true;
        }
      }
      destroyedByContact.push({ id: enemy.id, type: enemy.type });
      destroyedEnemyFlashes.push({
        enemyId: enemy.id,
        centerX: enemy.centerX,
        centerY: enemy.centerY,
        size: Math.max(enemy.width, enemy.height),
        stepsRemaining: DESTROYED_ENEMY_FLASH_STEPS,
      });
      continue;
    }
    // Regular contact (Epic §11.1): the same pair can apply damage at most
    // once per 0.75 s; the enemy is not damaged or destroyed.
    if ((cooldowns[enemy.id] ?? 0) > 0) {
      continue;
    }
    if (!input.godModeEnabled) {
      playerHull = Math.max(
        0,
        playerHull - (input.contactDamageByType[enemy.type] ?? 15),
      );
      aircraftFlash = AIRCRAFT_DAMAGE_FLASH_STEPS;
      if (playerHull <= 0) {
        defeated = true;
      }
    }
    cooldowns[enemy.id] = PAIR_CONTACT_COOLDOWN_STEPS;
  }
  if (EVIDENCE_COUNTERS_ENABLED && input.evidence !== undefined) {
    input.evidence.addContactCandidates(evidenceCandidates);
    input.evidence.addContactIntersections(evidenceIntersections);
  }
  const enemies = input.enemies.filter(
    (enemy) => !destroyedByContact.some((info) => info.id === enemy.id),
  );
  return {
    enemies,
    playerHullIntegrity: playerHull,
    playerDefeated: defeated,
    pairContactCooldownSteps: cooldowns,
    aircraftDangerFlashStepsRemaining: aircraftFlash,
    destroyedByContact,
    destroyedEnemyFlashes,
  };
}
