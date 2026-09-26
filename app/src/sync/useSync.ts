import { useSyncExternalStore } from 'react';
import { getStatus, subscribe } from './engine';

/** Current sync status, re-rendering when it changes. */
export const useSyncStatus = () => useSyncExternalStore(subscribe, getStatus);
