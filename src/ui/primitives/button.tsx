import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  /** Full-width content button (DS §8.3). */
  readonly fill?: boolean;
  /** Icon-only utility button; requires an accessible name (DS §8.3). */
  readonly iconOnly?: boolean;
  readonly children?: ReactNode;
}

/**
 * The one canonical Button primitive (DS §8.3, DS-AC-002): approved semantic
 * variants, shared structure, typography, height, interaction states and
 * disabled behaviour.
 */
export function Button({
  variant = 'secondary',
  fill = false,
  iconOnly = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  const classes = [
    'ds-button',
    `ds-button--${variant}`,
    fill ? 'ds-button--fill' : '',
    iconOnly ? 'ds-button--icon-only' : '',
    className ?? '',
  ]
    .filter((part) => part !== '')
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
