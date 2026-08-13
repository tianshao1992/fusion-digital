'use client';

import { useSyncExternalStore } from 'react';
import type { EfitStore, EfitStoreSnapshot } from './store';

export function useEfitStore(store: EfitStore): EfitStoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
