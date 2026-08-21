import type { ReactElement } from 'react';
import { Text } from '../primitives';

export function BootView(): ReactElement {
  return (
    <main data-testid="boot-view" className="ds-boot-view">
      <Text style="body">Loading…</Text>
    </main>
  );
}
