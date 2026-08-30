import { useState } from 'react';
import type { ReactElement } from 'react';
import { useApplication } from '../application-context';
import { NewGameConfirmationOverlay } from '../overlays';
import { Button, Text } from '../primitives';

/**
 * Game Over Screen (Epic §13.6, V02-AC-016/017): the terminal Screen of the
 * current persisted run when a Defeat cannot be repaired. `New Game` opens the
 * blocking destructive confirmation; confirming atomically replaces the
 * campaign through the composition-root-owned New Game command and opens
 * Operations. User Settings are never reset. Game Over never silently deletes
 * campaign data; the replacement happens only after the explicit confirmation
 * (Epic §18).
 */
export function GameOverScreen(): ReactElement {
  const { newGame, sessionSeedSource } = useApplication();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      // A fresh seed draws a new Pilot; the session reset (runStatus active)
      // reopens Operations through the Session Router. The composition-root
      // command coalesces concurrent activations of this logical confirmation.
      const sessionSeed = sessionSeedSource.getSessionSeed();
      await newGame.run(sessionSeed);
    } catch {
      // The atomic replacement failed; nothing was overwritten. Keep the
      // confirmation open so the player can retry or cancel without data loss.
      setBusy(false);
    }
  };

  return (
    <main
      data-testid="game-over-screen"
      className="ds-screen ds-game-over-screen"
      aria-label="Game Over"
    >
      <Text as="h1" style="title">
        Game Over
      </Text>
      <Text as="p" style="body">
        The aircraft cannot be repaired.
      </Text>
      <Text as="p" style="body">
        The current operation is over.
      </Text>
      <Button variant="primary" onClick={() => setConfirmationOpen(true)}>
        New Game
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
