import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

export type PanelVariant = 'default' | 'compact' | 'on-background';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: PanelVariant;
  readonly as?: 'div' | 'nav' | 'aside' | 'section';
  readonly children?: ReactNode;
}

/**
 * Canonical Panel primitive (DS §8.4). Screens use composition; Panel does not
 * define Screen layout.
 */
export function Panel({
  variant = 'default',
  as = 'div',
  className,
  children,
  ...rest
}: PanelProps): ReactElement {
  const Tag = as;
  const baseClass = `ds-panel ds-panel--${variant}`;
  return (
    <Tag
      className={
        className === undefined ? baseClass : `${baseClass} ${className}`
      }
      {...rest}
    >
      {children}
    </Tag>
  );
}
