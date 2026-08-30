import { useState } from 'react';
import type { ReactElement } from 'react';
import { useApplication } from '../application-context';
import { NewGameConfirmationOverlay } from '../overlays';
import { Button, Text } from '../primitives';

export interface SaveDataErrorScreenProps {
  /** Called after a confirmed New Game replaces the unreadable campaign. */
  readonly onResolved: () => void;
}

/**
 * Save Data Error Screen (Epic §14.2, V02-AC-021): opened when Boot cannot
 * load the stored campaign because validation or migration failed. The
 * unreadable data is never overwritten and no New Game is silently created;
 * `Start New Game` requires the blocking destructive confirmation, and only
 * the confirmed atomic replacement reopens Operations. The technical cause is
 * recorded as path-qualified diagnostics by Boot (never rendered here).
 */
export function SaveDataErrorScreen({
  onResolved,
}: SaveDataErrorScreenProps): ReactElement {
  const { newGame, sessionSeedSource } = useApplication();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const sessionSeed = sessionSeedSource.getSessionSeed();
      await newGame.run(sessionSeed);
      onResolved();
    } catch {
      // The atomic replacement failed; the unreadable data is untouched. Keep
      // the confirmation open so the player can retry or cancel.
      setBusy(false);
    }
  };

  return (
    <main
      data-testid="save-data-error-screen"
      className="ds-screen ds-save-data-error-screen"
      aria-label="Save Data Error"
    >
      <Text as="h1" style="title">
        Save Data Error
      </Text>
      <Text as="p" style="body">
        Saved game data could not be loaded.
      </Text>
      <Button variant="primary" onClick={() => setConfirmationOpen(true)}>
        Start New Game
      </Button>
      <NewGameConfirmationOverlay
        open={confirmationOpen}
        busy={busy}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setConfirmationOpen(false)}
      />
    </main>
  );
}
