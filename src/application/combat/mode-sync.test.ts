import { describe, expect, it, vi } from 'vitest';
import type { SessionAction } from '../session';
import { synchronizeSharedModeAfterToggle } from './combat-session';

describe('synchronizeSharedModeAfterToggle (AC-064)', () => {
  it('dispatches the shared Mouse Movement Enabled value exactly once when the mode changed', () => {
    const dispatch = vi.fn<(action: SessionAction) => void>();
    synchronizeSharedModeAfterToggle('mouse', 'keyboard', dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
  });

  it('dispatches `true` when the toggle restored Mouse Movement', () => {
    const dispatch = vi.fn<(action: SessionAction) => void>();
    synchronizeSharedModeAfterToggle('keyboard', 'mouse', dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'session/set-mouse-movement-enabled',
      enabled: true,
    });
  });

  it('does not dispatch when the toggle was rejected (mode unchanged)', () => {
    const dispatch = vi.fn<(action: SessionAction) => void>();
    synchronizeSharedModeAfterToggle('mouse', 'mouse', dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
