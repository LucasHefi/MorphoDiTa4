import { create } from 'zustand';
import { ModelInfo } from '../types/api';

interface ApiStore {
  models: { [key: string]: ModelInfo };
  selectedModel: string | null;
  isLoading: boolean;
  error: string | null;
  setModels: (models: { [key: string]: ModelInfo }) => void;
  setSelectedModel: (modelId: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useApiStore = create<ApiStore>((set) => ({
  models: {},
  selectedModel: null,
  isLoading: false,
  error: null,
  setModels: (models) => set({ models }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
