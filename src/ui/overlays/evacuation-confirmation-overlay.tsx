import { useRef } from 'react';
import type { ReactElement, RefObject } from 'react';
import { Button, Overlay, Text } from '../primitives';

export interface EvacuationConfirmationOverlayProps {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /**
   * V02-WI-05 E04: the still-existing control that opened this confirmation.
   * The active-Combat `Evacuate` affordance is disabled by the same commit that
   * opens the confirmation, so the browser blurs it before this Overlay mounts;
   * the explicit opener keeps the canonical focus restoration in DS §8.5 /
   * DS-AC-005 exact. Omitted for an opener the DOM can still identify.
   */
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * V02-WI-05 E03 blocking `Evacuate?` confirmation (Epic §13.4 step 1–3, §15.5,
 * V02-DEC-030; DS §8.26 `v0.2 Evacuation actions and confirmation`). One
 * Overlay serves BOTH origins — active Combat and the Pause Overlay — and the
 * application-owned lifecycle records which origin opened it.
 *
 * Exact copy and action contract:
 * - title `Evacuate?`;
 * - `Evacuation takes 5 seconds. Combat continues during the countdown.`;
 * - `You will retain 50% of net combat rewards. The mission will not be
 *   completed and the next mission will not unlock.`;
 * - `[Cancel] [Confirm Evacuation]` — `Cancel` is secondary, appears first, and
 *   owns initial focus; `Confirm Evacuation` is destructive.
 *
 * `Esc` is equivalent to Cancel (the Overlay primitive routes it to
 * `onClose`), Scrim interaction is inert, focus is trapped while open, and the
 * canonical `clamp(20rem, 30vw, 26rem)` Overlay width is retained. This
 * component owns no confirmation state: it relays Cancel/Confirm and the
 * application lifecycle decides exactly-once acceptance, restoration, and the
 * irreversible commitment.
 */
export function EvacuationConfirmationOverlay({
  open,
  onConfirm,
  onCancel,
  restoreFocusRef,
}: EvacuationConfirmationOverlayProps): ReactElement | null {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Overlay
      open={open}
      labelledBy="evacuation-confirmation-title"
      initialFocusRef={cancelRef}
      {...(restoreFocusRef === undefined ? {} : { restoreFocusRef })}
      // Esc is equivalent to Cancel; the Scrim is inert.
      onClose={onCancel}
      className="ds-evacuation-confirmation"
      header={
        <Text as="h2" id="evacuation-confirmation-title" style="heading">
          Evacuate?
        </Text>
      }
      actions={
        <>
          <Button variant="secondary" ref={cancelRef} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirm Evacuation
          </Button>
        </>
      }
    >
      <Text style="body">
        Evacuation takes 5 seconds. Combat continues during the countdown.
      </Text>
      <Text style="body">
        You will retain 50% of net combat rewards. The mission will not be
        completed and the next mission will not unlock.
      </Text>
    </Overlay>
  );
}
