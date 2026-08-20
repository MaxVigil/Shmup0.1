import { createContext, useContext } from 'react';
import type { AssetPreloadResult } from '@application/ports';
import type { SessionStore } from '@application/session';

/**
 * The successful Boot result delivered to the React tree at the composition
 * boundary (S02-WI01): the single application-owned Session Store and the
 * immutable prepared-asset availability result. The store is created exactly
 * once per page load and preload runs exactly once; both remain accessible to
 * Screens and S03+ consumers after Operations opens.
 */
export interface ApplicationContextValue {
  readonly store: SessionStore;
  readonly preparedAssets: AssetPreloadResult;
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
