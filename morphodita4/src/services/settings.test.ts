import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  loadPersistedSettings,
  SETTINGS_STORAGE_VERSION,
} from './settings';

describe('persisted settings contract', () => {
  it('round-trips supported settings at the current version', () => {
    const result = loadPersistedSettings(JSON.stringify({
      version: SETTINGS_STORAGE_VERSION,
      state: {
        theme: 'dark',
        language: 'pl',
        useOfflineMode: true,
        offlineFallbackEnabled: false,
        apiBatchSize: 100,
        navigation: '/settings',
      },
    }));

    expect(result).toEqual({
      recovered: false,
      state: {
        theme: 'dark',
        language: 'pl',
        useOfflineMode: true,
        offlineFallbackEnabled: false,
        apiBatchSize: 100,
        navigation: '/settings',
      },
    });
  });

  it('migrates legacy batchSize and marks the value as recovered', () => {
    const result = loadPersistedSettings(JSON.stringify({
      state: { theme: 'light', language: 'en', batchSize: 25 },
    }));

    expect(result.recovered).toBe(true);
    expect(result.state).toMatchObject({
      theme: 'light',
      language: 'en',
      apiBatchSize: 25,
    });
  });

  it('fails closed to safe defaults for malformed JSON and invalid ranges', () => {
    expect(loadPersistedSettings('{not-json}')).toEqual({
      recovered: true,
      state: DEFAULT_APP_SETTINGS,
    });
    expect(loadPersistedSettings(JSON.stringify({
      version: SETTINGS_STORAGE_VERSION,
      state: { theme: 'neon', language: 'xx', apiBatchSize: 9999, navigation: '' },
    }))).toEqual({
      recovered: true,
      state: DEFAULT_APP_SETTINGS,
    });
  });
});
