import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MorphoDiTaAPI } from '../../services/api';
import { useApiStore } from '../../store/useApiStore';
import { useAppStore } from '../../store/useAppStore';
import { ModelSelector } from './ModelSelector';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../services/api', () => ({
  MorphoDiTaAPI: {
    getModels: vi.fn(),
  },
}));

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

async function flushReactUpdates(callback: () => void | Promise<void>): Promise<void> {
  let pending: void | Promise<void> = undefined;
  flushSync(() => {
    pending = callback();
  });
  await pending;
  await Promise.resolve();
}

describe('ModelSelector', () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: boolean | undefined;

  beforeAll(() => {
    previousActEnvironment = reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT;
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    useAppStore.setState({ useOfflineMode: false });
    useApiStore.setState({
      models: {},
      selectedModel: null,
      isLoading: false,
      error: null,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await flushReactUpdates(() => root.unmount());
    container.remove();
  });

  it('performs only one automatic request when the model response is empty', async () => {
    vi.mocked(MorphoDiTaAPI.getModels)
      .mockResolvedValueOnce({ models: {} })
      .mockResolvedValueOnce({
        models: {
          'czech-model': {
            name: 'czech-model',
            language: 'cs',
            description: 'Czech model',
            capabilities: ['tag'],
          },
        },
      });

    await flushReactUpdates(async () => {
      root.render(<ModelSelector />);
    });

    expect(MorphoDiTaAPI.getModels).toHaveBeenCalledTimes(1);
  });

  it('ignores a model response from the previous API mode', async () => {
    let resolveRequest: (response: Awaited<ReturnType<typeof MorphoDiTaAPI.getModels>>) => void;
    vi.mocked(MorphoDiTaAPI.getModels).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    await flushReactUpdates(async () => {
      root.render(<ModelSelector />);
      await Promise.resolve();
    });
    expect(MorphoDiTaAPI.getModels).toHaveBeenCalledTimes(1);

    await flushReactUpdates(() => {
      useAppStore.setState({ useOfflineMode: true });
      useApiStore.getState().invalidateModels();
    });

    await flushReactUpdates(async () => {
      resolveRequest({
        models: {
          'stale-online-model': {
            name: 'stale-online-model',
            language: 'cs',
            description: 'Stale online model',
            capabilities: ['tag'],
          },
        },
      });
    });

    expect(useApiStore.getState().models).toEqual({});
    expect(useApiStore.getState().selectedModel).toBeNull();
  });

  it('names compact mode and exposes loading and error announcements', async () => {
    useApiStore.setState({
      models: { model: { name: 'model', language: 'en', description: 'English', capabilities: [] } },
      selectedModel: 'model', isLoading: true, error: null,
    });
    await flushReactUpdates(() => root.render(<MemoryRouter><ModelSelector compact /></MemoryRouter>));
    expect(container.querySelector('button[aria-haspopup="listbox"]')?.getAttribute('aria-label')).toBe('analyzer.model_select');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('svg.motion-safe\\:animate-spin')).not.toBeNull();

    await flushReactUpdates(() => {
      useApiStore.setState({ isLoading: false, error: 'network down' });
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('network down');
    const refreshButton = [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'database.refresh');
    expect(refreshButton).not.toBeUndefined();
    expect(refreshButton?.title).toBe('database.refresh');
    expect(refreshButton?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });
});
