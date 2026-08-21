import { createContext, useContext } from 'react';
import type { AssetPreloadResult } from '@application/ports';
import type { ContentCatalogue } from '@application/content';
import type { SessionStore } from '@application/session';

/**
 * The successful Boot result delivered to the React tree at the composition
 * boundary (S02-WI01): the single application-owned Session Store, the
 * immutable prepared-asset availability result, and the immutable validated
 * content catalogue consumed through the application seam (S06 Hangar views).
 * All are created exactly once per page load and remain accessible to Screens
 * and later consumers after Operations opens.
 */
export interface ApplicationContextValue {
  readonly store: SessionStore;
  readonly preparedAssets: AssetPreloadResult;
  readonly content: ContentCatalogue;
}

export const ApplicationContext = createContext<ApplicationContextValue | null>(
  null,
);

export function useApplication(): ApplicationContextValue {
  const value = useContext(ApplicationContext);
  if (value === null) {
    throw new Error(
      'ApplicationContext is missing: the composition root must provide it.',
    );
  }
  return value;
}
