import { createElement } from 'react';
import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';

export type TextStyle = 'caption' | 'body' | 'control' | 'heading' | 'title';
export type TextTone = 'primary' | 'secondary' | 'disabled' | 'danger';

export interface TextProps extends Omit<HTMLAttributes<HTMLElement>, 'style'> {
  /** Semantic markup is selected by content hierarchy, not by visual style. */
  readonly as?: ElementType;
  /** Approved presentation role (DS §8.1). */
  readonly style?: TextStyle;
  readonly tone?: TextTone;
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLElement>;
}

export function Text({
  as = 'span',
  style = 'body',
  tone = 'primary',
  className,
  children,
  ref,
  ...rest
}: TextProps): ReactNode {
  const presentationClass = `ds-text ds-text--${style} ds-text-tone--${tone}`;
  return createElement(
    as as ElementType,
    {
      ref,
      className:
        className === undefined
          ? presentationClass
          : `${presentationClass} ${className}`,
      ...rest,
    },
    children,
  );
}
