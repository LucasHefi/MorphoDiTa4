import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MorphoDiTaAPI, APIError } from './api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MorphoDiTaAPI', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('getModels successfully fetches models', async () => {
    const mockResponse = { models: { 'czech-model1': ['tag', 'analyze'] }, acknowledgements: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await MorphoDiTaAPI.getModels();
    expect(result).toEqual({
      models: {
        'czech-model1': {
          name: 'czech-model1',
          language: 'Czech',
          description: 'model1',
          capabilities: ['tag', 'analyze'],
        },
      },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://lindat.mff.cuni.cz/services/morphodita/api/models?output=json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('handles API errors gracefully with retry', async () => {
    vi.useFakeTimers();
    const serverError = {
      ok: false,
      status: 500,
      text: async () => 'temporary server error',
    };
    mockFetch.mockResolvedValue(serverError);

    try {
      const request = MorphoDiTaAPI.getModels();
      const rejection = expect(request).rejects.toThrow(APIError);

      await vi.runAllTimersAsync();
      await rejection;

      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    } finally {
      vi.useRealTimers();
    }
  });

  it('tagText sends correct parameters', async () => {
    const mockResponse = { model: 'model1', result: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await MorphoDiTaAPI.tagText('test', 'model1');
    expect(mockFetch).toHaveBeenCalledWith('https://lindat.mff.cuni.cz/services/morphodita/api/tag', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=test&model=model1&output=json'
    }));
  });
});
