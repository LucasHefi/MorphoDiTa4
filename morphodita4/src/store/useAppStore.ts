import { create } from 'zustand';
import { AppState } from '../types/common';

import { persist } from 'zustand/middleware';

interface AppStore extends AppState {
  setTheme: (theme: AppState['theme']) => void;
  setLanguage: (language: AppState['language']) => void;
  useOfflineMode: boolean;
  apiBatchSize: number;
  setUseOfflineMode: (useOfflineMode: boolean) => void;
  setApiBatchSize: (apiBatchSize: number) => void;
  navigation: string;
  setNavigation: (path: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'cs',
      useOfflineMode: false,
      apiBatchSize: 50,
      navigation: '/',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setUseOfflineMode: (useOfflineMode) => set({ useOfflineMode }),
      setApiBatchSize: (apiBatchSize) => set({ apiBatchSize }),
      setNavigation: (navigation) => set({ navigation }),
    }),
    {
      name: 'morphodita-settings',
    }
  )
);
