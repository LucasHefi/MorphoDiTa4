import { ModelsResponse, GenerateResponse, AnalyzeResponse, TagResponse, TokenizeResponse, ModelInfo } from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { OfflineSidecar } from './offlineSidecar'
import type { TransportNotice, TransportStatus } from '../types/common'

const ONLINE_API_BASE_URL = 'https://lindat.mff.cuni.cz/services/morphodita/api';

function setTransportStatus(status: TransportStatus, notice: TransportNotice | null = null): void {
  useAppStore.getState().setTransportStatus?.(status, notice);
}

async function getOfflineBaseUrl(): Promise<string> {
  const offlineUrl = OfflineSidecar.getCurrentOfflineBaseUrl();
  return offlineUrl ?? OfflineSidecar.start();
}

async function getBaseUrl(): Promise<string> {
  const { useOfflineMode } = useAppStore.getState();
  if (useOfflineMode) {
    const offlineUrl = await getOfflineBaseUrl();
    setTransportStatus('offline', 'offline-explicit');
    return offlineUrl;
  }
  return ONLINE_API_BASE_URL;
}

export class APIError extends Error {
  constructor(message: string, public status?: number, public retryAfterMs?: number) {
    super(message)
    this.name = 'APIError'
  }
}

export class APITransportError extends Error {
  readonly code = 'ONLINE_AND_OFFLINE_UNAVAILABLE' as const;
  readonly onlineError: unknown;
  readonly offlineError: unknown;

  constructor(onlineError: unknown, offlineError: unknown) {
    super('The online API is unavailable and the local MorphoDiTa fallback could not be started.');
    this.name = 'APITransportError';
    this.onlineError = onlineError;
    this.offlineError = offlineError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type ApiRequestOptions = { signal?: AbortSignal };

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof APIError)) return true;
  return error.status === 429 || (error.status !== undefined && error.status >= 500 && error.status <= 599);
}

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchWithRetryOnce<T>(url: string, options: RequestInit = {}, retries = 3, backoff = 1000): Promise<T> {
  const externalSignal = options.signal ?? undefined;
  if (externalSignal?.aborted) throw createAbortError();

  for (;;) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error detail');
        throw new APIError(
          `HTTP error! status: ${response.status}. Detail: ${errorText}`,
          response.status,
          parseRetryAfter(response.headers?.get('retry-after') ?? null),
        );
      }
      return await response.json() as T;
    } catch (error) {
      if (externalSignal?.aborted) throw createAbortError();
      if (retries <= 0 || !isRetryable(error)) throw error;
      const retryAfter = error instanceof APIError ? error.retryAfterMs : undefined;
      const delay = Math.max(backoff, retryAfter ?? 0);
      retries -= 1;
      backoff *= 2;
      await waitForRetry(delay, externalSignal);
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

function isOfflineFallbackEligible(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false;
  if (error instanceof APIError) {
    return error.status === 429 || (error.status !== undefined && error.status >= 500 && error.status <= 599);
  }
  return true;
}

function replaceBaseUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url);
  return `${baseUrl}${parsed.pathname}${parsed.search}`;
}

async function fetchWithRetry<T>(url: string, options: RequestInit = {}, retries = 3, backoff = 1000): Promise<T> {
  try {
    const response = await fetchWithRetryOnce<T>(url, options, retries, backoff);
    if (url.startsWith(ONLINE_API_BASE_URL)) setTransportStatus('online');
    return response;
  } catch (onlineError) {
    const { useOfflineMode, offlineFallbackEnabled } = useAppStore.getState();
    if (
      useOfflineMode ||
      !offlineFallbackEnabled ||
      !url.startsWith(ONLINE_API_BASE_URL) ||
      !isOfflineFallbackEligible(onlineError)
    ) {
      throw onlineError;
    }

    try {
      const offlineBaseUrl = await getOfflineBaseUrl();
      const response = await fetchWithRetryOnce<T>(replaceBaseUrl(url, offlineBaseUrl), options, retries, backoff);
      setTransportStatus('offline', 'offline-fallback');
      return response;
    } catch (offlineError) {
      throw new APITransportError(onlineError, offlineError);
    }
  }
}

export const MorphoDiTaAPI = {
  async getModels(options: ApiRequestOptions = {}): Promise<{ models: { [key: string]: ModelInfo } }> {
    const base = await getBaseUrl()
    const response = await fetchWithRetry<ModelsResponse>(`${base}/models?output=json`, {
      signal: options.signal,
    });
    const transformedModels: { [key: string]: ModelInfo } = {};
    
    Object.entries(response.models).forEach(([name, capabilities]) => {
      const language = name.split('-')[0] || 'unknown';
      const description = name.split('-').slice(1).join(' ') || name;
      
      transformedModels[name] = {
        name,
        language: language.charAt(0).toUpperCase() + language.slice(1),
        description,
        capabilities
      };
    });
    
    return { models: transformedModels };
  },

  async tagText(data: string, model: string, output: 'json' | 'xml' | 'vertical' = 'json', options: ApiRequestOptions = {}): Promise<TagResponse> {
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)

    return fetchWithRetry<TagResponse>(`${base}/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    })
  },

  async analyzeText(
    data: string,
    model: string,
    guesser: boolean = true,
    inputFormat: 'untokenized' | 'vertical' = 'untokenized',
    derivation: 'none' | 'root' | 'path' | 'tree' = 'none',
    convertTagset?: string,
    output: 'json' | 'xml' | 'vertical' = 'json',
    options: ApiRequestOptions = {},
  ): Promise<AnalyzeResponse> {
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)
    params.append('guesser', guesser ? 'yes' : 'no')
    params.append('input', inputFormat)
    if (derivation !== 'none') params.append('derivation', derivation)
    if (convertTagset) params.append('convert_tagset', convertTagset)

    return fetchWithRetry<AnalyzeResponse>(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    })
  },

  async generateForms(
    data: string,
    model: string,
    guesser: boolean = true,
    convertTagset?: string,
    output: 'json' | 'xml' | 'vertical' = 'json',
    options: ApiRequestOptions = {},
  ): Promise<GenerateResponse> {
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)
    params.append('guesser', guesser ? 'yes' : 'no')
    if (convertTagset) params.append('convert_tagset', convertTagset)

    return fetchWithRetry<GenerateResponse>(`${base}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    })
  },

  async tokenizeText(data: string, model: string, output: 'json' | 'xml' | 'vertical' = 'json', options: ApiRequestOptions = {}): Promise<TokenizeResponse> {
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)

    return fetchWithRetry<TokenizeResponse>(`${base}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    })
  },
}
