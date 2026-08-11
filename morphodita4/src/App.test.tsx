import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

const dbStoreMock = vi.hoisted(() => ({
  loadSessions: vi.fn(),
}));
const apiRefreshMock = vi.hoisted(() => vi.fn());
const lifecycleMock = vi.hoisted(() => vi.fn());

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
vi.mock('./services/appLifecycle', () => ({ registerAppCloseHook: lifecycleMock }));
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

import App, { Layout } from './App';

async function flushReactUpdates(callback: () => void | Promise<void>): Promise<void> {
  let pending: void | Promise<void> = undefined;
  flushSync(() => {
    pending = callback();
  });
  await pending;
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
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

  it('loads activity at startup and whenever Home becomes active', async () => {
    const router = createMemoryRouter(
      [{ path: '*', element: <Layout><div>content</div></Layout> }],
      { initialEntries: ['/analyzer'] },
    );
    await flushReactUpdates(() => {
      root.render(<RouterProvider router={router} />);
    });

    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(1);

    await flushReactUpdates(() => router.navigate('/', { flushSync: true }));
    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(2);

    await flushReactUpdates(() => router.navigate('/analyzer', { flushSync: true }));

    await flushReactUpdates(() => router.navigate('/', { flushSync: true }));
    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(3);
    router.dispose();
  });
});

describe('App lifecycle registration', () => {
  it('registers the close hook once without affecting activity loading', async () => {
    lifecycleMock.mockResolvedValue(null);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await flushReactUpdates(() => root.render(<App />));

    expect(lifecycleMock).toHaveBeenCalledOnce();
    await flushReactUpdates(() => root.unmount());
    container.remove();
  });

  it('renders a fixed recovery diagnostic when native lifecycle registration fails', async () => {
    lifecycleMock.mockRejectedValue(new Error('private registration payload'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await flushReactUpdates(() => root.render(<App />));

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('transport.restart');
    expect(consoleError).toHaveBeenCalledWith('Application lifecycle registration failed.');
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('private registration payload'));

    await flushReactUpdates(() => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
