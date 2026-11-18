import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MorphoDiTaAPI } from '../services/api';
import type { ModelCapability, ModelInfo } from '../types/api';
import { useApiStore } from './useApiStore';
import { useWizardStore } from './useWizardStore';

vi.mock('../services/api', () => ({
  MorphoDiTaAPI: {
    getModels: vi.fn(),
  },
}));

const response = (name: string): { models: Record<string, ModelInfo> } => ({
  models: {
    [name]: {
      name,
      language: 'cs',
      description: name,
       capabilities: ['tag' satisfies ModelCapability],
    },
  },
});

describe('useApiStore model loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useWizardStore.getState().reset();
    useApiStore.setState({
      models: {},
      selectedModel: null,
      isLoading: false,
      error: null,
    });
  });

  const prepareSummary = () => {
    useApiStore.setState({ selectedModel: 'old-model' });
    useWizardStore.setState({ currentStep: 4, keywordsText: 'akcionářského', run: {
      status: 'ready', sessionId: 'old-session', completedPhase: 'ready', checkpoint: {
        source: { input: 'akcionářského', model: 'old-model' }, lookup: { newWords: ['akcionářského'] },
      },
    }, processingResult: { model: 'old-model', inputWords: 1, newWords: [], uniqueLemmas: 1, lemmas: ['wrong'], forms: [], taggedTokens: [], relations: [] } });
  };
  const expectInvalidated = () => {
    expect(useWizardStore.getState()).toMatchObject({ currentStep: 1, keywordsText: 'akcionářského', processingResult: null, resultsInvalidated: true });
    expect(useWizardStore.getState().run).toEqual({ status: 'idle', sessionId: '', completedPhase: 'none', checkpoint: undefined });
  };
  it('removes stale summary and checkpoints on a manual model change, preserving input', () => {
    prepareSummary();
    useApiStore.getState().setSelectedModel('czech-250909');
    expectInvalidated();
  });
  it('immediately invalidates old results when connection settings invalidate the model catalog', () => {
    prepareSummary();
    useApiStore.getState().invalidateModels();
    expectInvalidated();
  });
  it('invalidates results when refreshing replaces a model, but retains them for the same model', async () => {
    prepareSummary();
    vi.mocked(MorphoDiTaAPI.getModels).mockResolvedValueOnce(response('old-model'));
    await useApiStore.getState().refreshModels();
    expect(useWizardStore.getState().currentStep).toBe(4);
    useApiStore.getState().setSelectedModel('old-model');
    expect(useWizardStore.getState().processingResult?.model).toBe('old-model');
    vi.mocked(MorphoDiTaAPI.getModels).mockResolvedValueOnce(response('czech-250909'));
    await useApiStore.getState().refreshModels();
    expectInvalidated();
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
