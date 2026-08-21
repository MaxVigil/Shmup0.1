import type { ContentCatalogue } from '../content';
import type { AircraftId, WeaponType } from '@domain/index';

/** Presentation-neutral view of one approved Primary Weapon (Base §7.2). */
export interface WeaponOptionView {
  readonly type: WeaponType;
  readonly displayName: string;
  readonly damage: number;
  readonly fireRate: number;
  readonly basicDroneHits: number;
}

/**
 * Builds the approved Weapon Selection options from the canonical catalogue
 * (Base §7.2, DS §8.14). Basic Drone hits are derived from the canonical
 * enemy Hull and weapon damage; no balance value is duplicated here.
 */
export function weaponOptions(
  content: ContentCatalogue,
): readonly WeaponOptionView[] {
  const drone = content.enemies.find((enemy) => enemy.type === 'basic-drone');
  if (drone === undefined) {
    throw new Error('Hangar views: canonical Basic Drone content is missing.');
  }
  return content.weapons.map((weapon) => ({
    type: weapon.type,
    displayName: weapon.displayName,
    damage: weapon.damage,
    fireRate: weapon.fireRate,
    basicDroneHits: Math.ceil(drone.maximumHullIntegrity / weapon.damage),
  }));
}

/** Approved aircraft display name from the canonical catalogue (Base §6.3). */
export function aircraftDisplayName(
  content: ContentCatalogue,
  aircraftId: AircraftId,
): string {
  const aircraft = content.aircraft.find((entry) => entry.id === aircraftId);
  if (aircraft === undefined) {
    throw new Error('Hangar views: the session aircraft is missing.');
  }
  return aircraft.displayName;
}
