import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MorphoDiTaAPI } from '../services/api';
import { useApiStore } from './useApiStore';

vi.mock('../services/api', () => ({
  MorphoDiTaAPI: {
    getModels: vi.fn(),
  },
}));

const response = (name: string) => ({
  models: {
    [name]: {
      name,
      language: 'cs',
      description: name,
      capabilities: ['tag'],
    },
  },
});

describe('useApiStore model loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useApiStore.setState({
      models: {},
      selectedModel: null,
      isLoading: false,
      error: null,
    });
  });

  it('ignores an invalidated request that finishes after its replacement', async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    let resolveSecond!: (value: ReturnType<typeof response>) => void;
    vi.mocked(MorphoDiTaAPI.getModels)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));

    const firstRequest = useApiStore.getState().refreshModels();
    useApiStore.getState().invalidateModels();
    const secondRequest = useApiStore.getState().refreshModels();

    resolveSecond(response('current-offline-model'));
    await secondRequest;
    resolveFirst(response('stale-online-model'));
    await firstRequest;

    expect(MorphoDiTaAPI.getModels).toHaveBeenCalledTimes(2);
    expect(Object.keys(useApiStore.getState().models)).toEqual(['current-offline-model']);
    expect(useApiStore.getState().selectedModel).toBe('current-offline-model');
    expect(useApiStore.getState().isLoading).toBe(false);
  });
});
