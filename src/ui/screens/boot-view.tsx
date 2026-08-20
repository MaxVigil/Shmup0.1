import type { CSSProperties, ReactElement } from 'react';

// Boot View: solid canvas background with "Loading…" (Master §5.1). The
// approved token values are inlined because the CSS custom-property token
// mechanism arrives with the Design System slice (S03).
const bootViewStyle: CSSProperties = {
  backgroundColor: '#080B0E', // canvas
  color: '#F1F5F7', // text-primary
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function BootView(): ReactElement {
  return (
    <main data-testid="boot-view" style={bootViewStyle}>
      Loading…
    </main>
  );
}
