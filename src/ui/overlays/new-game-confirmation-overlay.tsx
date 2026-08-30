import { useRef } from 'react';
import type { ReactElement } from 'react';
import { Button, Overlay, Text } from '../primitives';

export interface NewGameConfirmationOverlayProps {
  readonly open: boolean;
  /** Disables both actions while the atomic New Game replacement is in flight. */
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Blocking destructive New Game confirmation shared by the Game Over Screen
 * (Epic §13.6) and the Save Data Error Screen (Epic §14.2): `Start a new game?
 * Current run progress will be reset.` — `Cancel` returns to the underlying
 * terminal Screen; `Confirm` (destructive) invokes the application command
 * that atomically replaces the campaign. Initial focus is `Cancel` (the safe
 * default) and focus is trapped while open (DS §10.4 pattern); Esc is
 * equivalent to Cancel. Confirmed New Game never resets persisted user
 * Settings (V02-AC-017).
 */
export function NewGameConfirmationOverlay({
  open,
  busy,
  onConfirm,
  onCancel,
}: NewGameConfirmationOverlayProps): ReactElement | null {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Overlay
      open={open}
      labelledBy="new-game-confirmation-title"
      initialFocusRef={cancelRef}
      onClose={onCancel}
      className="ds-new-game-confirmation"
      header={
        <Text as="h2" id="new-game-confirmation-title" style="heading">
          New Game
        </Text>
      }
      actions={
        <>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            Confirm
          </Button>
          <Button
            variant="secondary"
            ref={cancelRef}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </>
      }
    >
      <Text style="body">
        Start a new game? Current run progress will be reset.
      </Text>
    </Overlay>
  );
}
