import { create } from 'zustand';
import type { FilterOptions, WizardProcessingResult } from '../types/common';

interface WizardStore {
  currentStep: number;
  keywordsText: string;
  filters: FilterOptions;
  processingResult: WizardProcessingResult | null;
  setStep: (step: number) => void;
  setKeywordsText: (text: string) => void;
  setFilters: (filters: Partial<FilterOptions>) => void;
  setProcessingResult: (result: WizardProcessingResult) => void;
  reset: () => void;
}

const defaultFilters: FilterOptions = {
  removeDiacritics: false,
  removeDuplicates: false,
  removeStopWords: false,
  removeSpecialCharacters: true,
  showOnlyNew: false,
};

export const useWizardStore = create<WizardStore>((set) => ({
  currentStep: 1,
  keywordsText: '',
  filters: defaultFilters,
  processingResult: null,
  setStep: (currentStep) => set({ currentStep }),
  setKeywordsText: (keywordsText) => set({ keywordsText }),
  setFilters: (newFilters) => set((state) => ({ 
    filters: { ...state.filters, ...newFilters } 
  })),
  setProcessingResult: (processingResult) => set({ processingResult }),
  reset: () => set({ currentStep: 1, keywordsText: '', filters: defaultFilters, processingResult: null })
}));
