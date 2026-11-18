import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  APIContractError,
  APIError,
  APIInputError,
  assertModelSupportsOperation,
  MorphoDiTaAPI,
  normalizeAnalyzeResult,
} from './api';
import { useAppStore } from '../store/useAppStore';

const offlineSidecarMocks = vi.hoisted(() => ({
  getCurrentOfflineBaseUrl: vi.fn(() => 'http://127.0.0.1:8765'),
  start: vi.fn(async () => 'http://127.0.0.1:8765'),
}));
vi.mock('./offlineSidecar', () => ({ OfflineSidecar: offlineSidecarMocks }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MorphoDiTaAPI', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    useAppStore.setState({ useOfflineMode: false, offlineFallbackEnabled: false });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
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

  it('uses exponential jittered delays for every retry before final success', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const serverError = {
        ok: false,
        status: 500,
        text: async () => 'temporary server error',
      };
      mockFetch
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ models: {} }) });
      const request = MorphoDiTaAPI.getModels();

      await vi.advanceTimersByTimeAsync(999);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1999);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(3999);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(4);
      await expect(request).resolves.toEqual({ models: {} });
    } finally {
      random.mockRestore();
    }
  });

  it('aborts an active fetch from the caller without retrying', async () => {
    const controller = new AbortController();
    let signal!: AbortSignal;
    mockFetch.mockImplementation((_url: string, options: RequestInit) => new Promise((_, reject) => {
      signal = options.signal!;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));

    const request = MorphoDiTaAPI.getModels({ signal: controller.signal });
    await Promise.resolve();
    expect(signal.aborted).toBe(false);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
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

  it('sends tagger advanced options without changing vertical sentence boundaries', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'model1', result: [] }) });
    const input = 'Kočky\nspí\n.\n\nPes\nběží\n.';
    await MorphoDiTaAPI.tagText(input, 'model1', 'json', {
      inputFormat: 'vertical', guesser: false, derivation: 'path', convertTagset: 'pdt_to_conll2009',
    });
    const params = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    expect(Object.fromEntries(params)).toMatchObject({ data: input, input: 'vertical', guesser: 'no', derivation: 'path', convert_tagset: 'pdt_to_conll2009' });
  });

  it('rejects invalid tagger input and derivation options before fetching', async () => {
    await expect(MorphoDiTaAPI.tagText('text', 'model1', 'json', { inputFormat: 'invalid' as 'vertical' })).rejects.toBeInstanceOf(APIInputError);
    await expect(MorphoDiTaAPI.tagText('text', 'model1', 'json', { derivation: 'invalid' as 'root' })).rejects.toBeInstanceOf(APIInputError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses vertical input for wizard words', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'model1', result: [[{ token: 'pes', lemma: 'pes', tag: 'N' }, { token: 'kočka', lemma: 'kočka', tag: 'N' }]] }) });
    const result = await MorphoDiTaAPI.tagText('pes\nkočka', 'model1', 'json', { inputFormat: 'vertical' });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(new URLSearchParams(init.body as string).get('input')).toBe('vertical');
    expect(result.result[0].map((item) => item.token)).toEqual(['pes', 'kočka']);
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

  it.each([
    [0, 500],
    [0.5, 1000],
    [1, 1500],
  ])('applies bounded jitter sample %s to exponential backoff', async (sample, expectedDelay) => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(sample);
    const controller = new AbortController();
    let request: Promise<unknown> | undefined;
    try {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'temporary failure' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ models: {} }) });

      request = MorphoDiTaAPI.getModels({ signal: controller.signal });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(request).resolves.toEqual({ models: {} });
    } finally {
      controller.abort();
      request?.catch(() => undefined);
      vi.clearAllTimers();
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it('keeps Retry-After as a strict minimum over jittered backoff', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const controller = new AbortController();
    let request: Promise<unknown> | undefined;
    try {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'rate limited',
          headers: { get: () => '1.5' },
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ models: {} }) });

      request = MorphoDiTaAPI.getModels({ signal: controller.signal });
      await vi.advanceTimersByTimeAsync(1498);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3);
      await expect(request).resolves.toEqual({ models: {} });
    } finally {
      controller.abort();
      request?.catch(() => undefined);
      vi.clearAllTimers();
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it('does not retry non-transient failures', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    try {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid request',
      });

      await expect(MorphoDiTaAPI.getModels()).rejects.toMatchObject({ retryable: false });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it('aborts a jittered retry delay', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    try {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'temporary failure' });

      const request = MorphoDiTaAPI.getModels({ signal: controller.signal });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it.each([
    ['negative seconds', '-2', 0],
    ['past date', 'Wed, 21 Oct 2015 07:28:00 GMT', 0],
    ['huge seconds', '999999999', 30000],
    ['invalid value', 'not-a-delay', undefined],
  ])('bounds Retry-After %s', async (_name, retryAfter, expected) => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'bad request',
      headers: { get: () => retryAfter },
    });

    await expect(MorphoDiTaAPI.getModels()).rejects.toMatchObject({ retryAfterMs: expected });
  });

  it('rejects oversized declared and actual response bodies before schema validation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => String(64 * 1024 * 1024 + 1) },
      text: async () => '{}',
    });
    await expect(MorphoDiTaAPI.getModels()).rejects.toBeInstanceOf(APIContractError);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      text: async () => 'x'.repeat(64 * 1024 * 1024 + 1),
    });
    await expect(MorphoDiTaAPI.getModels()).rejects.toBeInstanceOf(APIContractError);
  });

  it('rejects a streamed response as soon as a chunk crosses the byte limit and cleans up the reader', async () => {
    const cancel = vi.fn();
    const chunks = [new Uint8Array(32 * 1024 * 1024), new Uint8Array(32 * 1024 * 1024 + 1)];
    let reads = 0;
    const body = {
      getReader: () => ({
        read: vi.fn(async () => {
          const value = chunks[reads++];
          return value ? { done: false, value } : { done: true, value: undefined };
        }),
        cancel,
        releaseLock: vi.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    const text = vi.fn(async () => '{}');
    mockFetch.mockResolvedValueOnce({ ok: true, body, text });

    await expect(MorphoDiTaAPI.getModels()).rejects.toBeInstanceOf(APIContractError);
    expect(reads).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
  });

  it('uses the bounded stream reader for oversized error responses and falls back to safe detail', async () => {
    const cancel = vi.fn();
    let reads = 0;
    const body = {
      getReader: () => ({
        read: vi.fn(async () => {
          reads += 1;
          return reads === 1
            ? { done: false, value: new Uint8Array(64 * 1024 * 1024 + 1) }
            : { done: true, value: undefined };
        }),
        cancel,
        releaseLock: vi.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, body });

    await expect(MorphoDiTaAPI.getModels()).rejects.toMatchObject({
      code: 'HTTP_STATUS',
      message: 'HTTP error! status: 400. Detail: No error detail',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects deeply nested JSON with a bounded schema preflight', async () => {
    let nested: unknown = { models: {} };
    for (let index = 0; index < 300; index += 1) nested = { nested };
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(nested) });

    await expect(MorphoDiTaAPI.getModels()).rejects.toBeInstanceOf(APIContractError);
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

  it('exposes LINDA default_model without changing the transformed model map', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        default_model: 'czech-model1',
        models: { 'czech-model1': ['tag'] },
      }),
    });

    await expect(MorphoDiTaAPI.getModels()).resolves.toMatchObject({
      defaultModel: 'czech-model1',
      models: { 'czech-model1': { capabilities: ['tag'] } },
    });
  });

  it('rejects malformed model responses as a non-retryable contract error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: { broken: ['tag', 42] } }),
    });

    await expect(MorphoDiTaAPI.getModels()).rejects.toBeInstanceOf(APIContractError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('normalizes LINDA analyze analyses into display rows', () => {
    expect(normalizeAnalyzeResult([[{
      token: 'Kočka',
      analyses: [
        { lemma: 'kočka', tag: 'NNFS1-----A----' },
        { lemma: 'Kočka-1_;Y', tag: 'NNMS1-----A----' },
      ],
      space: ' ',
    }]])).toEqual([[
      { token: 'Kočka', lemma: 'kočka', tag: 'NNFS1-----A----', space: ' ' },
      { token: 'Kočka', lemma: 'Kočka-1_;Y', tag: 'NNMS1-----A----', space: ' ' },
    ]]);
  });

  it('rejects empty operation input before making a network request', async () => {
    await expect(MorphoDiTaAPI.tagText('   ', 'model1')).rejects.toBeInstanceOf(APIInputError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported model operations before network dispatch', () => {
    expect(() => assertModelSupportsOperation(
      { 'czech-model': { capabilities: ['tag'], name: 'czech-model', language: 'Czech', description: '' } },
      'czech-model',
      'generate',
    )).toThrow(APIInputError);
  });

  it.each([
    ['empty capabilities', []],
    ['duplicate capabilities', ['tag', 'tag']],
    ['unknown capabilities', ['unsupported']],
  ])('rejects %s', async (_name, capabilities) => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ models: { broken: capabilities } }) });
    await expect(MorphoDiTaAPI.getModels()).rejects.toBeInstanceOf(APIContractError);
  });

  it.each([
    ['tagText', () => MorphoDiTaAPI.tagText('text', 'model1', 'xml')],
    ['analyzeText', () => MorphoDiTaAPI.analyzeText('text', 'model1', true, 'untokenized', 'none', undefined, 'vertical')],
    ['generateForms', () => MorphoDiTaAPI.generateForms('text', 'model1', true, undefined, 'xml')],
    ['tokenizeText', () => MorphoDiTaAPI.tokenizeText('text', 'model1', 'vertical')],
  ])('rejects non-JSON %s output before network dispatch', async (_operation, request) => {
    await expect(request()).rejects.toMatchObject({ code: 'UNSUPPORTED_OUTPUT', retryable: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends authoritative JSON requests and preserves typed empty results', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'm', result: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'm', result: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'm', result: [] }) });

    await expect(MorphoDiTaAPI.analyzeText('a b', 'm')).resolves.toEqual({ model: 'm', result: [] });
    await expect(MorphoDiTaAPI.generateForms('a', 'm', false, 'strip')).resolves.toEqual({ model: 'm', result: [] });
    await expect(MorphoDiTaAPI.tokenizeText('a b', 'm')).resolves.toEqual({ model: 'm', result: [] });
    expect(mockFetch.mock.calls.map(([, request]) => request.body)).toEqual([
      'data=a+b&model=m&output=json&guesser=yes&input=untokenized',
      'data=a&model=m&output=json&guesser=no&convert_tagset=strip',
      'data=a+b&model=m&output=json',
    ]);
  });

  it.each([
    ['/models', () => MorphoDiTaAPI.getModels(), { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }],
    ['/tag', () => MorphoDiTaAPI.tagText('x', 'm'), { ok: true, json: async () => ({ model: 'm', result: [[{ token: 'x' }]] }) }],
    ['/analyze', () => MorphoDiTaAPI.analyzeText('x', 'm'), { ok: true, json: async () => ({ model: 'm', result: [[{ token: 'x', analyses: [{ lemma: 1, tag: 'N' }] }]] }) }],
    ['/generate', () => MorphoDiTaAPI.generateForms('x', 'm'), { ok: true, json: async () => ({ model: 'm', result: [[{ form: 'x', lemma: 1, tag: 'N' }]] }) }],
    ['/tokenize', () => MorphoDiTaAPI.tokenizeText('x', 'm'), { ok: true, json: async () => ({ model: 'm', result: [[{ token: 1 }]] }) }],
  ])('classifies malformed %s responses without retry', async (endpoint, request, response) => {
    mockFetch.mockResolvedValueOnce(response);
    await expect(request()).rejects.toMatchObject({
      code: endpoint === '/models' ? 'INVALID_JSON' : 'SCHEMA_MISMATCH',
      endpoint,
      retryable: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('exposes structured HTTP status errors and only retries transient statuses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'missing',
      headers: { get: () => null },
    });
    await expect(MorphoDiTaAPI.getModels()).rejects.toMatchObject({
      code: 'HTTP_STATUS', endpoint: '/models', status: 404, retryable: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('classifies network failures as retryable and retains the cause', async () => {
    vi.useFakeTimers();
    const cause = new TypeError('offline');
    mockFetch.mockRejectedValue(cause);
    try {
      const request = MorphoDiTaAPI.getModels();
      const rejection = request.catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await rejection as APIError;
      expect(error).toMatchObject({ code: 'NETWORK', endpoint: '/models', retryable: true });
      expect(error.cause).toBe(cause);
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies its timeout separately from network failure', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation((_url: string, options: RequestInit) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    try {
      const request = MorphoDiTaAPI.getModels();
      const rejection = expect(request).rejects.toMatchObject({ code: 'TIMEOUT', endpoint: '/models', retryable: true });
      await vi.runAllTimersAsync();
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the sidecar operation path when tag falls back after an online failure', async () => {
    const onlineFailure = new TypeError('offline');
    useAppStore.setState({ offlineFallbackEnabled: true });
    mockFetch.mockImplementation((url: string) => url.startsWith('https://')
      ? Promise.reject(onlineFailure)
      : Promise.resolve({ ok: true, json: async () => ({ model: 'm', result: [] }) }));
    vi.useFakeTimers();

    try {
      const request = MorphoDiTaAPI.tagText('text', 'm');
      await vi.runAllTimersAsync();
      await expect(request).resolves.toEqual({ model: 'm', result: [] });
      expect(mockFetch.mock.calls.at(-1)?.[0]).toBe('http://127.0.0.1:8765/tag');
      expect(mockFetch.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ body: 'data=text&model=m&output=json' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the sidecar models path and preserves the query during fallback', async () => {
    const onlineFailure = new TypeError('offline');
    useAppStore.setState({ offlineFallbackEnabled: true });
    mockFetch.mockImplementation((url: string) => url.startsWith('https://')
      ? Promise.reject(onlineFailure)
      : Promise.resolve({ ok: true, json: async () => ({ models: {} }) }));
    vi.useFakeTimers();

    try {
      const request = MorphoDiTaAPI.getModels();
      await vi.runAllTimersAsync();
      await expect(request).resolves.toEqual({ models: {} });
      expect(mockFetch.mock.calls.at(-1)?.[0]).toBe('http://127.0.0.1:8765/models?output=json');
    } finally {
      vi.useRealTimers();
    }
  });
});
