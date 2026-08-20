import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootElement = document.querySelector<HTMLElement>('#app');

if (rootElement === null) {
  throw new Error('Application root #app is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <main data-testid="technical-scaffold">Shmup technical scaffold</main>
  </StrictMode>,
);
