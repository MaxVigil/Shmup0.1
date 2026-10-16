import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  CANNON,
  CONTENT_CATALOGUE,
  GERMAN_FIGHTER,
  HUNTER_DRONE,
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MACHINE_GUN,
  MISSIONS,
  MVP_ENEMY_GROUP_SCHEDULE,
  PILOTS,
  PLAYER_PROJECTILE,
  RANGED_DRONE,
  derivedTotals,
  totalDrones,
} from './index';

describe('canonical content catalogue', () => {
  it('loads a validated catalogue', () => {
    expect(CONTENT_CATALOGUE.aircraft).toHaveLength(1);
    expect(CONTENT_CATALOGUE.weapons).toHaveLength(2);
    expect(CONTENT_CATALOGUE.enemies).toHaveLength(3);
    expect(CONTENT_CATALOGUE.missions).toHaveLength(3);
    expect(CONTENT_CATALOGUE.pilots).toHaveLength(6);
  });

  it('defines the single German Fighter aircraft with 100 maximum Hull Integrity', () => {
    expect(GERMAN_FIGHTER.id).toBe('german-fighter');
    expect(GERMAN_FIGHTER.displayName).toBe('German Fighter');
    expect(GERMAN_FIGHTER.maximumHullIntegrity).toBe(100);
  });

  it('defines Machine Gun and Cannon with the v0.2 tuning (Epic §10)', () => {
    expect(MACHINE_GUN.type).toBe('machine-gun');
    expect(MACHINE_GUN.damage).toBe(1);
    expect(MACHINE_GUN.fireRate).toBe(5);
    expect(MACHINE_GUN.projectileSpeedViewportHeightPerSecond).toBe(0.55);
    expect(CANNON.type).toBe('cannon');
    expect(CANNON.damage).toBe(3);
    expect(CANNON.fireRate).toBe(1.5);
    expect(CANNON.projectileSpeedViewportHeightPerSecond).toBe(0.45);
  });

  it('defines the v0.2 regular-enemy family (Epic §9)', () => {
    expect(BASIC_DRONE.type).toBe('basic-drone');
    expect(BASIC_DRONE.maximumHullIntegrity).toBe(3);
    expect(BASIC_DRONE.movementSpeedViewportHeightPerSecond).toBe(0.12);
    expect(BASIC_DRONE.contactDamage).toBe(15);
    expect(BASIC_DRONE.playerDestructionReward).toBe(1);
    expect(BASIC_DRONE.escapePenalty).toBe(1);
    expect(RANGED_DRONE.maximumHullIntegrity).toBe(4);
    expect(RANGED_DRONE.movementSpeedViewportHeightPerSecond).toBe(0.09);
    expect(RANGED_DRONE.playerDestructionReward).toBe(2);
    expect(RANGED_DRONE.escapePenalty).toBe(2);
    expect(HUNTER_DRONE.maximumHullIntegrity).toBe(3);
    expect(HUNTER_DRONE.movementSpeedViewportHeightPerSecond).toBe(0.18);
    expect(HUNTER_DRONE.committedAttackSpeedViewportHeightPerSecond).toBe(0.26);
    expect(HUNTER_DRONE.contactDamage).toBe(35);
    expect(HUNTER_DRONE.playerDestructionReward).toBe(2);
    expect(HUNTER_DRONE.escapePenalty).toBe(2);
  });

  it('defines the shared player-projectile configuration (lifetime only)', () => {
    expect(PLAYER_PROJECTILE.maximumLifetimeSeconds).toBe(2);
    expect(CONTENT_CATALOGUE.projectile).toBe(PLAYER_PROJECTILE);
  });

  it('defines the approved v0.2 mission registry in authored order (Epic §8)', () => {
    expect(MISSIONS.map((mission) => mission.id)).toEqual([
      'interception-01',
      'interception-02',
      'interception-03',
    ]);
    expect(MISSIONS.map((mission) => mission.displayName)).toEqual([
      'Interception 01',
      'Interception 02',
      'Interception 03',
    ]);
    // Completion rewards (Epic §12) and unlock chain (Epic §6.2).
    expect(INTERCEPTION_01.completionReward).toBe(8);
    expect(INTERCEPTION_01.unlocksMissionId).toBe('interception-02');
    expect(INTERCEPTION_02.completionReward).toBe(12);
    expect(INTERCEPTION_02.unlocksMissionId).toBe('interception-03');
    expect(INTERCEPTION_03.completionReward).toBe(16);
    expect(INTERCEPTION_03.unlocksMissionId).toBeNull();
    // Authored maximum reward facts (Epic §8.1–8.3, patch §5). The v0.2.1
    // patch §2.1 authors Interception 01 as 286 Basic / 52 Ranged / 10 Hunter /
    // 0 Elite: 286×1 + 52×2 + 10×2 = 410 combat, 410 + 8 = 418 payout. §2.2
    // authors Interception 02 as 352/100/28/0: 352 + 200 + 56 = 608, and
    // 608 + 12 = 620. §2.3 authors Interception 03 as 376/128/48/1:
    // 376 + 256 + 96 + 8 (Elite) = 736 combat, and 736 + 16 = 752 payout.
    expect(INTERCEPTION_01.maximumCombatReward).toBe(410);
    expect(INTERCEPTION_01.maximumSuccessPayout).toBe(418);
    expect(INTERCEPTION_02.maximumCombatReward).toBe(608);
    expect(INTERCEPTION_02.maximumSuccessPayout).toBe(620);
    expect(INTERCEPTION_03.maximumCombatReward).toBe(736);
    expect(INTERCEPTION_03.maximumSuccessPayout).toBe(752);
  });

  it('matches the exact Interception 01 authored timeline and staging (Epic §8.1, V02-DEC-021, V021-AC-001)', () => {
    expect(INTERCEPTION_01.encounters.map((e) => e.timeSeconds)).toEqual([
      4, 55, 100, 140, 188.7,
    ]);
    expect(INTERCEPTION_01.encounters.map((e) => e.id)).toEqual([
      'interception-01-e1',
      'interception-01-e2',
      'interception-01-e3',
      'interception-01-e4',
      'interception-01-e5',
    ]);
    // v0.2.1 patch §2.1 authors every Mission 01 Encounter itself: e1/e2 are
    // fixed Top, e3–e5 name no region, so no Encounter draws the mission-data
    // stream, and the whole mission is one qualitative `authored-stagger`
    // formation with no role-level delay left.
    expect(INTERCEPTION_01.encounters.map((e) => e.entry)).toEqual([
      { kind: 'fixed', region: 'top' },
      { kind: 'fixed', region: 'top' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
    ]);
    expect(INTERCEPTION_01.encounters.map((e) => e.formation)).toEqual([
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
    ]);
    expect(INTERCEPTION_01.encounters.map((e) => e.roleDelays ?? null)).toEqual(
      [null, null, null, null, null],
    );
    // The 26 §2.1 formations project into 80 Arrival Group rows (e1 23, e2 18,
    // e3 15, e4 21, e5 3), each Encounter opening on its own arrival time.
    const staging = INTERCEPTION_01.encounters.map((e) => e.staging ?? []);
    expect(staging.map((groups) => groups.length)).toEqual([23, 18, 15, 21, 3]);
    expect(staging.map((groups) => groups[0]?.offsetSeconds)).toEqual([
      0, 0, 0, 0, 0,
    ]);

    // §2.1 rows are the authored four-column Top row plus the two explicit
    // `fixed-side` Hunters that consume no mission-data draw.
    const e1 = INTERCEPTION_01.encounters[0];
    expect(e1?.staging?.[0]?.members).toEqual([
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
    ]);
    const fixedHunter = (side: 'upper-left' | 'upper-right') => ({
      type: 'hunter-drone' as const,
      placement: { kind: 'fixed-side' as const, side, yViewportFraction: 0.2 },
    });
    // §2.1 screening: the first `BR12` block of e2 opens with two Basic rows at
    // 00:55 / 00:55.65 and only then the screened `(B, R, R, B)` row at 00:56.30,
    // so the first Ranged member of the mission is screened by Basic rows.
    const e2 = INTERCEPTION_01.encounters[1];
    expect(e2?.staging?.[0]?.offsetSeconds).toBe(0);
    expect(e2?.staging?.[1]?.offsetSeconds).toBeCloseTo(0.65, 9);
    expect(e2?.staging?.[0]?.members).toEqual([
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
    ]);
    expect(e2?.staging?.[2]?.members).toEqual([
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
    ]);
    // e3 opens with the first `BRH14` mixed block: four Top Basics followed by
    // the two fixed-side Hunters (`H-L` then `H-R`) at 0.20 VH.
    const e3 = INTERCEPTION_01.encounters[2];
    expect(e3?.staging?.[0]?.members).toEqual([
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
      fixedHunter('upper-left'),
      fixedHunter('upper-right'),
    ]);
    const e5 = INTERCEPTION_01.encounters[4];
    expect(e5?.staging?.map((group) => group.members.length)).toEqual([
      6, 4, 4,
    ]);
    expect(e5?.staging?.[2]?.members).toEqual([
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
    ]);
    // Derived invariants (§2.1): 80 authored arrival moments running from 00:04
    // to the closing 03:10, with no row gap wider than the approved 6.7 s.
    const arrivalMoments = INTERCEPTION_01.encounters.flatMap((encounter) =>
      (encounter.staging ?? []).map(
        (group) => encounter.timeSeconds + group.offsetSeconds,
      ),
    );
    expect(arrivalMoments).toHaveLength(80);
    expect(arrivalMoments[0]).toBe(4);
    const gaps = arrivalMoments
      .slice(1)
      .map((moment, index) => moment - arrivalMoments[index]!);
    expect(Math.max(...gaps)).toBeCloseTo(6.7, 9);
    expect(arrivalMoments[arrivalMoments.length - 1]).toBe(190);
    expect(derivedTotals(INTERCEPTION_01)).toEqual({
      basic: 286,
      ranged: 52,
      hunter: 10,
      elite: 0,
    });
  });

  it('matches the exact Interception 02 authored timeline and staging (Epic §8.2, V021-AC-003)', () => {
    expect(INTERCEPTION_02.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 50, 100, 150, 200, 244,
    ]);
    // §2.2 authors 35 formations (6×B16, 16×R4-12, 7×R4-16, 4×H4-12, 2×RH6-16)
    // that expand into 112 Arrival Group rows. The sixth Encounter starts at
    // 04:04 so its last screened Ranged row still lands on the retained 04:20
    // Countdown step.
    const staging = INTERCEPTION_02.encounters.map((e) => e.staging ?? []);
    expect(staging.map((groups) => groups.length)).toEqual([
      20, 24, 23, 19, 18, 8,
    ]);
    const moments = INTERCEPTION_02.encounters.flatMap((encounter) =>
      (encounter.staging ?? []).map(
        (group) => encounter.timeSeconds + group.offsetSeconds,
      ),
    );
    expect(moments).toHaveLength(112);
    expect(moments[0]).toBe(10);
    expect(moments[moments.length - 1]).toBe(260);
    // Ranged first appears at 00:51.30, behind two Basic rows (§2.2 screening).
    const e2 = INTERCEPTION_02.encounters[1];
    for (const group of e2?.staging?.slice(0, 2) ?? []) {
      expect(group.members.map((member) => member.type)).toEqual([
        'basic-drone',
        'basic-drone',
        'basic-drone',
        'basic-drone',
      ]);
    }
    expect(e2?.staging?.[2]?.members.map((member) => member.type)).toEqual([
      'ranged-drone',
      'ranged-drone',
      'ranged-drone',
      'ranged-drone',
    ]);
    // The first simultaneous side wave is `H4-12` at 02:00: two fixed-side
    // Hunters per side (0.15 / 0.25 VH) behind four Top Basics. §2.2 removes
    // Mission 02's seeded sides entirely, so no member is a seeded-side member.
    const firstHunterWave = INTERCEPTION_02.encounters[2]?.staging?.find(
      (group) => group.offsetSeconds === 20,
    );
    expect(firstHunterWave?.offsetSeconds).toBe(20);
    expect(firstHunterWave?.members).toEqual([
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'fixed-side',
          side: 'upper-left',
          yViewportFraction: 0.15,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'fixed-side',
          side: 'upper-left',
          yViewportFraction: 0.25,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'fixed-side',
          side: 'upper-right',
          yViewportFraction: 0.15,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'fixed-side',
          side: 'upper-right',
          yViewportFraction: 0.25,
        },
      },
    ]);
    for (const group of INTERCEPTION_02.encounters.flatMap(
      (encounter) => encounter.staging ?? [],
    )) {
      for (const member of group.members) {
        expect(['top', 'fixed-side']).toContain(member.placement.kind);
      }
    }
    expect(derivedTotals(INTERCEPTION_02)).toEqual({
      basic: 352,
      ranged: 100,
      hunter: 28,
      elite: 0,
    });
  });

  it('matches the exact Interception 03 authored timeline and staging (Epic §8.3, V021-AC-001)', () => {
    expect(INTERCEPTION_03.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 55, 95, 140, 190, 235, 275, 320,
    ]);
    expect(INTERCEPTION_03.encounters.map((e) => e.id)).toEqual([
      'interception-03-e1',
      'interception-03-e2',
      'interception-03-e3',
      'interception-03-e4',
      'interception-03-e5',
      'interception-03-e6',
      'interception-03-e7',
      'interception-03-e8',
    ]);
    // v0.2.1 patch §2.3 authors 44 regular formations (26×BR12, 9×B12, 3×H4-12,
    // 6×RH6-16) plus the preserved Elite-only `05:20` group. Every §2.3 Encounter
    // names no entry region — its rows combine Top and both fixed Sides — so the
    // three superseded seeded Hunter side draws are gone and no Encounter reads
    // the `mission-data` stream.
    expect(INTERCEPTION_03.encounters.map((e) => e.entry)).toEqual([
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
      { kind: 'unspecified' },
    ]);
    expect(INTERCEPTION_03.encounters.map((e) => e.formation)).toEqual([
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'authored-stagger',
      'upper-combat-zone',
    ]);
    expect(INTERCEPTION_03.encounters.map((e) => e.roleDelays ?? null)).toEqual(
      [null, null, null, null, null, null, null, null],
    );
    // The 44 formations project into 123 regular Arrival Group rows (e1 18,
    // e2 18, e3 16, e4 19, e5 16, e6 16, e7 20) plus the single Elite-only group.
    const staging = INTERCEPTION_03.encounters.map((e) => e.staging ?? []);
    expect(staging.map((groups) => groups.length)).toEqual([
      18, 18, 16, 19, 16, 16, 20, 1,
    ]);
    const moments = INTERCEPTION_03.encounters.flatMap((encounter) =>
      (encounter.staging ?? []).map(
        (group) => encounter.timeSeconds + group.offsetSeconds,
      ),
    );
    expect(moments).toHaveLength(124);
    expect(moments[0]).toBe(10);
    expect(moments[moments.length - 1]).toBe(320);
    // e1 opens with a `BR12` block at 00:10: two four-column Basic rows at
    // 00:10 / 00:10.65, then the four-Ranged row at 00:11.30 — Ranged enters
    // behind Basic rows so it appears screened without any speed change.
    const e1 = INTERCEPTION_03.encounters[0];
    expect(e1?.staging?.[0]?.offsetSeconds).toBe(0);
    expect(e1?.staging?.[1]?.offsetSeconds).toBeCloseTo(0.65, 9);
    expect(e1?.staging?.[2]?.offsetSeconds).toBeCloseTo(1.3, 9);
    expect(e1?.staging?.[0]?.members).toEqual([
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
    ]);
    expect(e1?.staging?.[2]?.members).toEqual([
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
      { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
    ]);
    // The first Hunters arrive at 01:35 with e3's `RH6-16` wave: six Top Basics
    // (0.25…0.75) followed by three fixed-side Hunters per side
    // (0.10/0.20/0.30 VH), left side first in ascending Y.
    const fixedSideHunter = (
      side: 'upper-left' | 'upper-right',
      yViewportFraction: number,
    ) => ({
      type: 'hunter-drone' as const,
      placement: { kind: 'fixed-side' as const, side, yViewportFraction },
    });
    const h6Wave = INTERCEPTION_03.encounters[2]?.staging?.[0];
    expect(h6Wave?.offsetSeconds).toBe(0);
    expect(h6Wave?.members.slice(6)).toEqual([
      fixedSideHunter('upper-left', 0.1),
      fixedSideHunter('upper-left', 0.2),
      fixedSideHunter('upper-left', 0.3),
      fixedSideHunter('upper-right', 0.1),
      fixedSideHunter('upper-right', 0.2),
      fixedSideHunter('upper-right', 0.3),
    ]);
    // The first `H4-12` wave (e4 02:41, second group of that block: groups 0–2
    // belong to the 02:20 `BR12`, groups 3–5 to 02:27, groups 6–8 to 02:34)
    // carries two fixed-side Hunters per side at 0.15 / 0.25 VH behind four Top
    // Basics.
    const h4Wave = INTERCEPTION_03.encounters[3]?.staging?.[9];
    expect(h4Wave?.offsetSeconds).toBeCloseTo(21, 9);
    expect(h4Wave?.members.slice(4)).toEqual([
      fixedSideHunter('upper-left', 0.15),
      fixedSideHunter('upper-left', 0.25),
      fixedSideHunter('upper-right', 0.15),
      fixedSideHunter('upper-right', 0.25),
    ]);
    // Every §2.3 regular member uses Top or a fixed Side: no seeded-side member
    // survives, so no member can consume a `mission-data` draw.
    for (const group of INTERCEPTION_03.encounters.flatMap(
      (encounter) => encounter.staging ?? [],
    )) {
      for (const member of group.members) {
        expect(['top', 'fixed-side']).toContain(member.placement.kind);
      }
    }
    // The preserved Elite-only `05:20` group stays the last authored arrival.
    expect(INTERCEPTION_03.encounters[7]?.composition).toEqual([
      { type: 'elite-drone', count: 1 },
    ]);
    expect(INTERCEPTION_03.encounters[7]?.staging).toEqual([
      {
        offsetSeconds: 0,
        members: [
          { type: 'elite-drone', placement: { kind: 'top', fraction: 0.5 } },
        ],
      },
    ]);
    expect(derivedTotals(INTERCEPTION_03)).toEqual({
      basic: 376,
      ranged: 128,
      hunter: 48,
      elite: 1,
    });
  });

  it('retains the temporary v0.1 enemy-group schedule for the Combat seam only', () => {
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.startTimeSeconds).toBe(0);
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.intervalSeconds).toBe(10);
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.groupCount).toBe(11);
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.dronesPerGroup).toBe(3);
    expect(MVP_ENEMY_GROUP_SCHEDULE.final.timeSeconds).toBe(110);
    expect(MVP_ENEMY_GROUP_SCHEDULE.final.dronesPerGroup).toBe(5);
    expect(totalDrones(MVP_ENEMY_GROUP_SCHEDULE)).toBe(38);
  });

  it('defines exactly the six approved Pilot records', () => {
    expect(PILOTS.map((pilot) => pilot.name)).toEqual([
      'Олександр Коваленко',
      'Іван Петренко',
      'Марія Бондар',
      'Андрій Шевченко',
      'Олена Мельник',
      'Наталія Ткаченко',
    ]);
  });
});
