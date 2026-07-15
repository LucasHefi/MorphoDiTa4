export interface ModelInfo {
  name: string;
  language: string;
  description: string;
  capabilities: string[];
}

export interface MorphologicalTag {
  lemma: string;
  tag: string;
  form?: string;
  probability?: number;
  space?: string;
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
  space: string;
}

export interface APIResponse<T> {
  model: string;
  result: T;
  acknowledgements?: string[];
}

// Responses for specific endpoints
export interface ModelsResponse {
  models: { [key: string]: string[] };
  acknowledgements: string[];
}

export interface GenerateResponse {
  model: string;
  result: Array<MorphologicalTag[]>;
}

export interface AnalyzeResponse {
  model: string;
  result: Array<MorphologicalTag[]>;
}

export interface TagResponse {
  model: string;
  result: Array<Array<{ token: string; space?: string } & MorphologicalTag>>;
}

export interface TokenizeResponse {
  model: string;
  result: Array<Token[]>;
}
