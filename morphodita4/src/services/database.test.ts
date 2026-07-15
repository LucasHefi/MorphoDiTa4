import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseService } from './database';
import * as tauriApi from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createSession calls invoke with correct arguments', async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue(1);

    const result = await DatabaseService.createSession({ input_text: 'Test Session' });
    
    expect(tauriApi.invoke).toHaveBeenCalledWith('create_session', { 
      session: {
        operation: 'analyze',
        model: '',
        input_text: 'Test Session',
        parameters: '{}',
        status: 'pending',
        result_count: 0
      }
    });
    expect(result.id).toEqual('1');
  });

  it('insertMorphologicalData calls invoke with correct arguments', async () => {
    const mockData = {
      session_id: '1',
      source_type: 'word' as const,
      word: 'test',
      lemma: 'test',
      tag: 'NNIS1-----A----'
    };
    vi.mocked(tauriApi.invoke).mockResolvedValue(1);

    const result = await DatabaseService.insertMorphologicalData(mockData);

    expect(tauriApi.invoke).toHaveBeenCalledWith('insert_morphological_data', { data: [mockData] });
    expect(result).toBe(1);
  });
});
