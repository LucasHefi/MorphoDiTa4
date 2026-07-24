import { create } from 'zustand';
import { AppState, TransportNotice, TransportStatus } from '../types/common';

import { createJSONStorage, persist } from 'zustand/middleware';
import {
  createValidatedSettingsStorage,
  loadPersistedSettings,
  readInitialSettings,
  SETTINGS_STORAGE_VERSION,
} from '../services/settings';

interface AppStore extends AppState {
  setTheme: (theme: AppState['theme']) => void;
  setLanguage: (language: AppState['language']) => void;
  useOfflineMode: boolean;
  apiBatchSize: number;
  setUseOfflineMode: (useOfflineMode: boolean) => void;
  setOfflineFallbackEnabled: (offlineFallbackEnabled: boolean) => void;
  setApiBatchSize: (apiBatchSize: number) => void;
  navigation: string;
  setNavigation: (path: string) => void;
  settingsRecoveryNotice: boolean;
  dismissSettingsRecovery: () => void;
  transportStatus: TransportStatus;
  transportNotice: TransportNotice | null;
  setTransportStatus: (transportStatus: TransportStatus, transportNotice?: TransportNotice | null) => void;
}

const initialSettings = readInitialSettings();

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialSettings.state,
      settingsRecoveryNotice: initialSettings.recovered,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setUseOfflineMode: (useOfflineMode) => set({ useOfflineMode }),
      setOfflineFallbackEnabled: (offlineFallbackEnabled) => set({ offlineFallbackEnabled }),
      setApiBatchSize: (apiBatchSize) => set({ apiBatchSize }),
      setNavigation: (navigation) => set({ navigation }),
      dismissSettingsRecovery: () => set({ settingsRecoveryNotice: false }),
      transportStatus: 'unknown',
      transportNotice: null,
      setTransportStatus: (transportStatus, transportNotice = null) => set({ transportStatus, transportNotice }),
    }),
    {
      name: 'morphodita-settings',
      version: SETTINGS_STORAGE_VERSION,
      storage: createJSONStorage(() => createValidatedSettingsStorage()),
      migrate: (persisted) => loadPersistedSettings(JSON.stringify({ state: persisted, version: SETTINGS_STORAGE_VERSION })).state,
      partialize: ({ theme, language, useOfflineMode, offlineFallbackEnabled, apiBatchSize, navigation }) => ({
        theme,
        language,
        useOfflineMode,
        offlineFallbackEnabled,
        apiBatchSize,
        navigation,
      }),
    }
  )
);
