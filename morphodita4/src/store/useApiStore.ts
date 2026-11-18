import { create } from 'zustand';
import { useWizardStore } from './useWizardStore';
import { ModelInfo } from '../types/api';
import { MorphoDiTaAPI } from '../services/api';
import { selectAvailableModel } from '../services/modelSelection';

let modelsRequestGeneration = 0;

interface ApiStore {
  models: { [key: string]: ModelInfo };
  catalogRevision: number;
  selectedModel: string | null;
  isLoading: boolean;
  error: string | null;
  setSelectedModel: (modelId: string | null) => void;
  refreshModels: () => Promise<void>;
  invalidateModels: () => void;
}

export const useApiStore = create<ApiStore>((set, get) => ({
  models: {},
  catalogRevision: 0,
  selectedModel: null,
  isLoading: false,
  error: null,
  setSelectedModel: (selectedModel) => {
    if (selectedModel !== get().selectedModel) useWizardStore.getState().invalidateProcessing();
    set({ selectedModel });
  },
  refreshModels: async () => {
    if (get().isLoading) return;

    const requestGeneration = ++modelsRequestGeneration;
    set({ isLoading: true, error: null });
    try {
      const response = await MorphoDiTaAPI.getModels();
      if (requestGeneration !== modelsRequestGeneration) return;

      const selectedModel = selectAvailableModel(response.models, get().selectedModel, response.defaultModel ?? null);
      if (selectedModel !== get().selectedModel) useWizardStore.getState().invalidateProcessing();
      set({ models: response.models, selectedModel });
    } catch (error) {
      if (requestGeneration !== modelsRequestGeneration) return;
      console.error('Failed to fetch models:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (requestGeneration === modelsRequestGeneration) {
        set({ isLoading: false });
      }
    }
  },
  invalidateModels: () => {
    useWizardStore.getState().invalidateProcessing();
    modelsRequestGeneration += 1;
    set({ models: {}, selectedModel: null, isLoading: false, error: null, catalogRevision: get().catalogRevision + 1 });
  },
}));
