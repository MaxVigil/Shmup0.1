/**
 * Canonical branded identifiers for MVP content.
 *
 * Each identifier is a distinct branded string so that an id belonging to one
 * entity domain cannot be passed where another is expected (Code Principles
 * §4). The brand marker exists only at the type level. Weapon, enemy and
 * mission identity is expressed by the typed unions in `src/domain/model`
 * (`WeaponType`, `EnemyType`, `MissionType`).
 */

type Brand<T extends string> = string & { readonly __brand: T };

export type AircraftId = Brand<'AircraftId'>;
export type PilotId = Brand<'PilotId'>;

// Brand constructors. The type assertion only attaches the type-level brand to
// the same string value; authored values are verified by content validation.
export function aircraftId(value: string): AircraftId {
  return value as AircraftId;
}

export function pilotId(value: string): PilotId {
  return value as PilotId;
}
