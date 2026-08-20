import { pilotId } from '@domain/identifiers';
import type { PilotId } from '@domain/identifiers';

export interface PilotRecord {
  readonly id: PilotId;
  /** Approved player-facing Pilot name (Base §9.2). */
  readonly name: string;
}

export const PILOTS: readonly PilotRecord[] = [
  { id: pilotId('pilot-kovalenko'), name: 'Олександр Коваленко' },
  { id: pilotId('pilot-petrenko'), name: 'Іван Петренко' },
  { id: pilotId('pilot-bondar'), name: 'Марія Бондар' },
  { id: pilotId('pilot-shevchenko'), name: 'Андрій Шевченко' },
  { id: pilotId('pilot-melnyk'), name: 'Олена Мельник' },
  { id: pilotId('pilot-tkachenko'), name: 'Наталія Ткаченко' },
];
