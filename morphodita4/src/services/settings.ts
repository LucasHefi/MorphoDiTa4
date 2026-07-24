import type { AppState } from '../types/common';

export const SETTINGS_STORAGE_KEY = 'morphodita-settings';
export const SETTINGS_STORAGE_VERSION = 1;

export interface PersistedAppSettings extends AppState {
  navigation: string;
}

export const DEFAULT_APP_SETTINGS: PersistedAppSettings = {
  theme: 'system',
  language: 'cs',
  useOfflineMode: false,
  offlineFallbackEnabled: true,
  apiBatchSize: 50,
  navigation: '/',
};

export interface LoadedSettings {
  state: PersistedAppSettings;
  recovered: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTheme = (value: unknown): value is AppState['theme'] =>
  value === 'light' || value === 'dark' || value === 'system';

const isLanguage = (value: unknown): value is AppState['language'] =>
  value === 'cs' || value === 'en' || value === 'pl';

const isBatchSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 500;

export function loadPersistedSettings(raw: string | null): LoadedSettings {
  if (!raw) return { state: { ...DEFAULT_APP_SETTINGS }, recovered: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || (typeof parsed.version === 'number' && parsed.version > SETTINGS_STORAGE_VERSION)) {
      return { state: { ...DEFAULT_APP_SETTINGS }, recovered: true };
    }

    const storedVersion = typeof parsed.version === 'number' ? parsed.version : 0;
    const persistedState = isRecord(parsed.state) ? parsed.state : parsed;
    const legacyBatchSize = persistedState.batchSize;
    const state: PersistedAppSettings = {
      theme: isTheme(persistedState.theme) ? persistedState.theme : DEFAULT_APP_SETTINGS.theme,
      language: isLanguage(persistedState.language) ? persistedState.language : DEFAULT_APP_SETTINGS.language,
      useOfflineMode: typeof persistedState.useOfflineMode === 'boolean'
        ? persistedState.useOfflineMode
        : DEFAULT_APP_SETTINGS.useOfflineMode,
      offlineFallbackEnabled: typeof persistedState.offlineFallbackEnabled === 'boolean'
        ? persistedState.offlineFallbackEnabled
        : DEFAULT_APP_SETTINGS.offlineFallbackEnabled,
      apiBatchSize: isBatchSize(persistedState.apiBatchSize)
        ? persistedState.apiBatchSize
        : isBatchSize(legacyBatchSize) ? legacyBatchSize : DEFAULT_APP_SETTINGS.apiBatchSize,
      navigation: typeof persistedState.navigation === 'string' && persistedState.navigation.length > 0
        ? persistedState.navigation
        : DEFAULT_APP_SETTINGS.navigation,
    };
    const recovered =
      storedVersion !== SETTINGS_STORAGE_VERSION ||
      state.theme !== persistedState.theme ||
      state.language !== persistedState.language ||
      state.useOfflineMode !== persistedState.useOfflineMode ||
      state.offlineFallbackEnabled !== persistedState.offlineFallbackEnabled ||
      state.apiBatchSize !== persistedState.apiBatchSize && state.apiBatchSize !== legacyBatchSize ||
      state.navigation !== persistedState.navigation;
    return { state, recovered };
  } catch {
    return { state: { ...DEFAULT_APP_SETTINGS }, recovered: true };
  }
}

export function readInitialSettings(): LoadedSettings {
  if (typeof localStorage === 'undefined') {
    return { state: { ...DEFAULT_APP_SETTINGS }, recovered: false };
  }
  return loadPersistedSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
}

interface RawStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

export function createValidatedSettingsStorage(): RawStorage {
  return {
    getItem: (name) => {
      const loaded = loadPersistedSettings(localStorage.getItem(name));
      return JSON.stringify({ state: loaded.state, version: SETTINGS_STORAGE_VERSION });
    },
    setItem: (name, value) => {
      const loaded = loadPersistedSettings(value);
      localStorage.setItem(name, JSON.stringify({ state: loaded.state, version: SETTINGS_STORAGE_VERSION }));
    },
    removeItem: (name) => localStorage.removeItem(name),
  };
}
