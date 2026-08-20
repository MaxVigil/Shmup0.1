import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('technical scaffold', () => {
  it('supports React DOM verification', () => {
    render(<main>Shmup technical scaffold</main>);

    expect(screen.getByRole('main').textContent).toBe(
      'Shmup technical scaffold',
    );
  });
});
