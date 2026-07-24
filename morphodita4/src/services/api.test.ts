import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MorphoDiTaAPI, APIError } from './api';
import { useAppStore } from '../store/useAppStore';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MorphoDiTaAPI', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    useAppStore.setState({ useOfflineMode: false, offlineFallbackEnabled: false });
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

  it('does not retry permanent client errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid request',
    });

    await expect(MorphoDiTaAPI.getModels()).rejects.toThrow(APIError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After for rate-limited responses', async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'rate limited',
          headers: { get: () => '2' },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: {} }),
        });

      const request = MorphoDiTaAPI.getModels();
      await vi.advanceTimersByTimeAsync(1999);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(request).resolves.toEqual({ models: {} });
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts a pending retry delay', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'temporary server error',
      });

      const request = MorphoDiTaAPI.getModels({ signal: controller.signal });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
