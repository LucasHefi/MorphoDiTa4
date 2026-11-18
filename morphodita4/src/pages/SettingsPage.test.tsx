import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { useAppStore } from '../store/useAppStore';
import { useApiStore } from '../store/useApiStore';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('Settings workspace controls', () => {
  let container: HTMLDivElement;
  let root: Root;
  const original = useAppStore.getState();

  beforeEach(() => {
    useAppStore.setState({ theme: 'light', language: 'cs', useOfflineMode: false, offlineFallbackEnabled: true, settingsRecoveryNotice: false });
    useApiStore.setState({ selectedModel: 'selected', models: { selected: { name: 'selected', language: 'Czech', description: 'Fixture', capabilities: ['analyze'] } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<MemoryRouter><SettingsPage /></MemoryRouter>));
  });
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
    useAppStore.setState(original);
    useApiStore.setState({ selectedModel: null, models: {} });
  });
  const button = (container: HTMLDivElement, label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)!;

  it('applies theme and language choices immediately and exposes their selected state', () => {
    flushSync(() => button(container, 'settings.themes.dark').click());
    expect(useAppStore.getState().theme).toBe('dark');
    expect(button(container, 'settings.themes.dark').getAttribute('aria-pressed')).toBe('true');
    flushSync(() => button(container, 'Polski').click());
    expect(useAppStore.getState().language).toBe('pl');
    expect(button(container, 'Polski').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps explicit local mode and fallback independent and invalidates the old model selection', () => {
    flushSync(() => container.querySelector<HTMLInputElement>('#settings-offline-mode')!.click());
    expect(useAppStore.getState().useOfflineMode).toBe(true);
    expect(useAppStore.getState().offlineFallbackEnabled).toBe(true);
    expect(useApiStore.getState().selectedModel).toBeNull();
    flushSync(() => container.querySelector<HTMLInputElement>('#settings-offline-fallback')!.click());
    expect(useAppStore.getState().useOfflineMode).toBe(true);
    expect(useAppStore.getState().offlineFallbackEnabled).toBe(false);
  });

  it('retains labeled processing fields and disables model download before consent', () => {
    for (const id of ['settings-offline-mode', 'settings-offline-fallback', 'settings-batch-size']) {
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(button(container, 'settings.modelDownloadButton').disabled).toBe(true);
    expect(container.textContent).toContain('settings.modelCommercialUseNo');
  });
});
