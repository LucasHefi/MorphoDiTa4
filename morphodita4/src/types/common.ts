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

import type { GeneratedForm, TaggedToken } from './api';

export interface WizardTokenRelation {
  inputToken: string;
  lemma: string;
  tag: string;
  generatedForms: GeneratedForm[];
  sourceIndex?: number;
  rawLemma?: string;
  sessionId?: string;
}

export interface WizardPipelineInput {
  token: TaggedToken;
  sourceIndex: number;
  rawLemma: string;
  cleanLemma: string;
  generatedForms: GeneratedForm[];
  sessionId: string;
}

export type WizardRunStatus = 'idle' | 'processing' | 'cancelled' | 'failed' | 'ready' | 'saved';

export interface WizardRunState {
  status: WizardRunStatus;
  sessionId: string;
  completedPhase: 'none' | 'lookup' | 'analysis' | 'generation' | 'ready' | 'saved';
  error?: string;
  checkpoint?: WizardCheckpoint;
}

export interface WizardCheckpoint {
  source: {
    input: string;
    model: string;
  };
  lookup: {
    newWords: string[];
  };
  analysis?: {
    taggedTokens: TaggedToken[];
    lemmas: string[];
  };
  generation?: {
    forms: GeneratedForm[];
  };
}

export interface WizardProcessingResult {
  lemmaModel?: string;
  inputWords: number;
  newWords: string[];
  uniqueLemmas: number;
  lemmas: string[];
  forms: GeneratedForm[];
  taggedTokens: TaggedToken[];
  relations: WizardTokenRelation[];
  model: string;
}

export interface AppState {
  theme: 'light' | 'dark' | 'system';
  language: 'cs' | 'en' | 'pl';
  useOfflineMode: boolean;
  offlineFallbackEnabled: boolean;
  apiBatchSize: number;
}

export type TransportStatus = 'unknown' | 'online' | 'offline';
export type TransportNotice = 'offline-explicit' | 'offline-fallback';

export interface SelectOption {
  value: string;
  label: string;
}
