import { create } from 'zustand';
import { ModelInfo } from '../types/api';
import { MorphoDiTaAPI } from '../services/api';
import { selectAvailableModel } from '../services/modelSelection';

let modelsRequestGeneration = 0;

interface ApiStore {
  models: { [key: string]: ModelInfo };
  selectedModel: string | null;
  isLoading: boolean;
  error: string | null;
  setSelectedModel: (modelId: string | null) => void;
  refreshModels: () => Promise<void>;
  invalidateModels: () => void;
}

export const useApiStore = create<ApiStore>((set, get) => ({
  models: {},
  selectedModel: null,
  isLoading: false,
  error: null,
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  refreshModels: async () => {
    if (get().isLoading) return;

    const requestGeneration = ++modelsRequestGeneration;
    set({ isLoading: true, error: null });
    try {
      const response = await MorphoDiTaAPI.getModels();
      if (requestGeneration !== modelsRequestGeneration) return;

      set({
        models: response.models,
        selectedModel: selectAvailableModel(response.models, get().selectedModel),
      });
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
    modelsRequestGeneration += 1;
    set({ models: {}, selectedModel: null, isLoading: false, error: null });
  },
}));
