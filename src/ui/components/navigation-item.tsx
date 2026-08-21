import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { Icon } from '../primitives';
import type { IconId } from '../primitives';

export interface NavigationItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly icon: IconId;
  readonly active?: boolean;
  readonly children?: ReactNode;
}

/**
 * Canonical Navigation Item (DS §8.7, §9.4): native button semantics, hover /
 * active / focus-visible states, active accent line (non-colour state signal).
 */
export function NavigationItem({
  label,
  icon,
  active = false,
  className,
  type = 'button',
  ...rest
}: NavigationItemProps): ReactElement {
  const classes = [
    'ds-navigation-item',
    active ? 'ds-navigation-item--active' : '',
    className ?? '',
  ]
    .filter((part) => part !== '')
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      <Icon icon={icon} size="medium" hidden />
      {label}
    </button>
  );
}
