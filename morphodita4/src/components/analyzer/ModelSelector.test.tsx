import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MorphoDiTaAPI } from '../../services/api';
import { useApiStore } from '../../store/useApiStore';
import { useAppStore } from '../../store/useAppStore';
import { ModelSelector } from './ModelSelector';

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
    await act(async () => root.unmount());
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

    await act(async () => {
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

    await act(async () => {
      root.render(<ModelSelector />);
      await Promise.resolve();
    });
    expect(MorphoDiTaAPI.getModels).toHaveBeenCalledTimes(1);

    act(() => {
      useAppStore.setState({ useOfflineMode: true });
      useApiStore.getState().invalidateModels();
    });

    await act(async () => {
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
});
