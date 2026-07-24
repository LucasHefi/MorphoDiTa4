export type DatabaseId = string | number;
export type DatabasePayload = Record<string, unknown>;
export type DatabaseRow = Session | MorphologicalData;

export interface Session {
  id?: string;
  operation: 'tag' | 'analyze' | 'generate' | 'tokenize';
  model: string;
  input_text: string;
  parameters: Record<string, unknown>;
  result_count: number;
  processing_time?: number;

  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at?: string;
  completed_at?: string;
}

export interface MorphologicalData {
  id: number;
  session_id: string;
  source_type: 'analysis' | 'generation';
  original_form?: string;
  lemma: string;
  tag: string;
  generated_form?: string;
  probability?: number;
  word?: string; // Legacy field if needed
  metadata?: string;
  created_at: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}
