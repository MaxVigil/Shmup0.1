import { aircraftId } from '@domain/identifiers';
import type { AircraftId } from '@domain/identifiers';

export interface AircraftDefinition {
  readonly id: AircraftId;
  readonly displayName: string;
  /** Maximum Hull Integrity for the aircraft (validated at catalogue load). */
  readonly maximumHullIntegrity: number;
}

export const GERMAN_FIGHTER: AircraftDefinition = {
  id: aircraftId('german-fighter'),
  displayName: 'German Fighter',
  maximumHullIntegrity: 100,
};

export const AIRCRAFT: readonly AircraftDefinition[] = [GERMAN_FIGHTER];
