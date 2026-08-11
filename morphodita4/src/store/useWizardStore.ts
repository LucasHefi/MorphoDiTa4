import { create } from 'zustand';
import type { FilterOptions, WizardProcessingResult, WizardRunState } from '../types/common';

interface WizardStore {
  currentStep: number;
  keywordsText: string;
  filters: FilterOptions;
  processingResult: WizardProcessingResult | null;
  run: WizardRunState;
  setStep: (step: number) => void;
  setKeywordsText: (text: string) => void;
  setFilters: (filters: Partial<FilterOptions>) => void;
  setProcessingResult: (result: WizardProcessingResult | null) => void;
  setRunState: (run: Partial<WizardRunState>) => void;
  cancel: () => void;
  resume: () => void;
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
  run: { status: 'idle', sessionId: '', completedPhase: 'none' },
  setStep: (currentStep) => set({ currentStep }),
  setKeywordsText: (keywordsText) => set((state) => {
    if (state.keywordsText === keywordsText) return { keywordsText };
    return {
      keywordsText,
      processingResult: null,
      run: { status: 'idle', sessionId: '', completedPhase: 'none', checkpoint: undefined },
    };
  }),
  setFilters: (newFilters) => set((state) => ({ 
    filters: { ...state.filters, ...newFilters } 
  })),
  setProcessingResult: (processingResult) => set({ processingResult }),
  setRunState: (run) => set((state) => ({ run: { ...state.run, ...run } })),
  cancel: () => set((state) => ({ run: { ...state.run, status: 'cancelled' } })),
  resume: () => set((state) => ({ run: { ...state.run, status: 'processing', error: undefined } })),
  reset: () => set({ currentStep: 1, keywordsText: '', filters: { ...defaultFilters }, processingResult: null, run: { status: 'idle', sessionId: '', completedPhase: 'none', checkpoint: undefined } })
}));
