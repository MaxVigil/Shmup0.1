import { describe, expect, it, vi } from 'vitest';
import type { CombatSession, CombatSessionInput } from './combat-session';

const createCombatSession =
  vi.fn<(input: CombatSessionInput) => CombatSession>();

vi.mock('@combat-presentation/entry', () => ({ createCombatSession }));

import { loadCombatSession } from './combat-session';

describe('lazy Combat session creation guard (S13-WI01)', () => {
  it('does not create a presentation owner after the mission is no longer current', async () => {
    const input = {} as CombatSessionInput;

    const loaded = await loadCombatSession(input, () => false);

    expect(loaded).toBeNull();
    expect(createCombatSession).not.toHaveBeenCalled();
  });
});
