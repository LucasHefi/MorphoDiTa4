export interface ProgressInfo {
  totalItems: number;
  processedItems: number;
  skippedItems: number;
  errorItems: number;
  currentItem: string;
  startTime: string; // ISO format string
  estimatedTimeRemaining: number; // in seconds
  processingSpeed: number; // items per second
  memoryUsage: number; // in bytes or MB
  phase: 'analysis' | 'generation' | 'storage' | 'idle';
}

export interface LogEntry {
  id: string;
  timestamp: string; // ISO format
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  details?: string;
}

export interface FilterOptions {
  removeDiacritics: boolean;
  removeDuplicates: boolean;
  removeStopWords: boolean;
  removeSpecialCharacters: boolean;
  stopWordsList?: string[];
  showOnlyNew?: boolean;
}

export type OperationType = 'tag' | 'analyze' | 'generate' | 'tokenize';

export interface AppState {
  theme: 'light' | 'dark' | 'system';
  language: 'cs' | 'en' | 'pl';
  useOfflineMode: boolean;
  apiBatchSize: number;
}

export interface SelectOption {
  value: string;
  label: string;
}
