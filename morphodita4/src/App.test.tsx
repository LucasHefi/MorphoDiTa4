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
const appStateMock=vi.hoisted(()=>({theme:'light',language:'en',transportNotice:null as string|null,useOfflineMode:false,transportStatus:'online'}));
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
  useAppStore: vi.fn(() => appStateMock),
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
    document.documentElement.lang = 'cs';
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

  it('leaves large activity inputs to the dedicated dashboard endpoint', async () => {
    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <Layout>
            <div>startup</div>
          </Layout>
        </MemoryRouter>,
      );
    });

    expect(document.documentElement.lang).toBe('en');
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
  });

  it('opens settings from the mode pill and omits only the redundant explicit-offline notice', async () => {
    appStateMock.useOfflineMode=true;appStateMock.transportNotice='offline-explicit';
    const router=createMemoryRouter([{path:'*',element:<Layout><div>content</div></Layout>}]);
    await flushReactUpdates(()=>root.render(<RouterProvider router={router}/>));
    const pill=container.querySelector('.mode-badge') as HTMLAnchorElement;
    expect(pill.textContent).toContain('design.localMode');expect(pill.getAttribute('href')).toBe('/settings');
    expect(container.querySelector('.transport-notice')).toBeNull();
    await flushReactUpdates(()=>pill.click());expect(router.state.location.pathname).toBe('/settings');
    appStateMock.transportNotice='offline-fallback';
    await flushReactUpdates(()=>root.render(<MemoryRouter><Layout>fallback</Layout></MemoryRouter>));
    expect(container.querySelector('.transport-notice')?.textContent).toBe('transport.offline-fallback');
    appStateMock.useOfflineMode=false;appStateMock.transportNotice=null;router.dispose();
  });

  it('does not reload full session inputs when navigating to the statistics overview', async () => {
    const router = createMemoryRouter(
      [{ path: '*', element: <Layout><div>content</div></Layout> }],
      { initialEntries: ['/analyzer'] },
    );
    await flushReactUpdates(() => {
      root.render(<RouterProvider router={router} />);
    });

    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();

    await flushReactUpdates(() => router.navigate('/', { flushSync: true }));
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();

    await flushReactUpdates(() => router.navigate('/analyzer', { flushSync: true }));

    await flushReactUpdates(() => router.navigate('/', { flushSync: true }));
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
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


describe('Workspace navigation accessibility', () => {
  it('keeps every route reachable and marks the active page with a skip target', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await flushReactUpdates(() => root.render(
      <MemoryRouter initialEntries={['/analyzer']}><Layout><main>Workspace</main></Layout></MemoryRouter>,
    ));
    expect([...container.querySelectorAll('nav a')].map((link) => link.getAttribute('href'))).toEqual([
      '/', '/analyzer', '/wizard', '/database', '/settings', '/about',
    ]);
    expect(container.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/analyzer');
    expect(container.querySelector('a[href="#workspace"]')).not.toBeNull();
    expect(container.querySelector('#workspace')?.getAttribute('tabindex')).toBe('-1');
    await flushReactUpdates(() => root.unmount());
    container.remove();
  });
});
