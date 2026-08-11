export interface ModelInfo {
  name: string;
  language: string;
  description: string;
  capabilities: ModelCapability[];
}

export type ModelCapability = 'tag' | 'analyze' | 'generate' | 'tokenize';

export type APIErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'HTTP_STATUS'
  | 'INVALID_JSON'
  | 'SCHEMA_MISMATCH'
  | 'OFFLINE_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_OUTPUT';

export interface APIErrorShape {
  code: APIErrorCode;
  endpoint: string;
  retryable: boolean;
  retryAfterMs?: number;
  status?: number;
  cause?: unknown;
}

export interface MorphologicalTag {
  lemma: string;
  tag: string;
  form?: string;
  probability?: number;
  space?: string;
}

export interface TaggedToken extends MorphologicalTag {
  token: string;
}

export interface GeneratedForm extends MorphologicalTag {
  form: string;
}

export interface TagComponents {
  rawTag: string;
  wordClass: string;
  subtype: string;
  gender: string;
  number: string;
  case: string;
  possessivity: string;
}

export interface Token {
  token: string;
  space?: string;
}

export type DisplayMorphologicalTag = MorphologicalTag & { token?: string };
export type AnalyzerResult = DisplayMorphologicalTag[][] | Token[][];

export interface APIResponse<T> {
  model: string;
  result: T;
  acknowledgements?: string[];
}

// Responses for specific endpoints
export interface ModelsResponse {
  models: { [key: string]: ModelCapability[] };
  default_model?: string;
  acknowledgements?: string[];
}

export interface GenerateResponse {
  model: string;
  result: GeneratedForm[][];
}

export interface AnalyzeResponse {
  model: string;
  result: AnalyzeToken[][];
}

export interface AnalyzeToken {
  token: string;
  analyses: MorphologicalTag[];
  space?: string;
}

export interface TagResponse {
  model: string;
  result: TaggedToken[][];
}

export interface TokenizeResponse {
  model: string;
  result: Array<Token[]>;
}
