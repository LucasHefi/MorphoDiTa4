import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

const dbStoreMock = vi.hoisted(() => ({
  loadSessions: vi.fn(),
}));
const apiRefreshMock = vi.hoisted(() => vi.fn());

vi.mock('./store/useDbStore', () => ({
  useDbStore: vi.fn(() => dbStoreMock),
}));
vi.mock('./store/useApiStore', () => ({
  useApiStore: {
    getState: () => ({ models: {}, refreshModels: apiRefreshMock }),
  },
}));
vi.mock('./store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({
    theme: 'light',
    language: 'en',
    transportNotice: null,
  })),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));
vi.mock('./pages/HomePage', () => ({ HomePage: () => null }));
vi.mock('./pages/AnalyzerPage', () => ({ AnalyzerPage: () => null }));
vi.mock('./pages/WizardPage', () => ({ WizardPage: () => null }));
vi.mock('./pages/SettingsPage', () => ({ SettingsPage: () => null }));
vi.mock('./pages/AboutPage', () => ({ AboutPage: () => null }));
vi.mock('./pages/DatabaseEditorPage', () => ({ DatabaseEditorPage: () => null }));

import { Layout } from './App';

async function flushReactUpdates(callback: () => void | Promise<void>): Promise<void> {
  let pending: void | Promise<void> = undefined;
  flushSync(() => {
    pending = callback();
  });
  await pending;
  await Promise.resolve();
}

describe('Layout startup loading', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    dbStoreMock.loadSessions.mockResolvedValue(undefined);
    apiRefreshMock.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await flushReactUpdates(() => root.unmount());
    container.remove();
  });

  it('invokes loadSessions once during startup', async () => {
    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <Layout>
            <div>startup</div>
          </Layout>
        </MemoryRouter>,
      );
    });

    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(1);
  });
});
