import {
  AnalyzeResponse,
  AnalyzeToken,
  GenerateResponse,
  ModelInfo,
  ModelsResponse,
  MorphologicalTag,
  TagResponse,
  TokenizeResponse,
} from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { OfflineSidecar } from './offlineSidecar'
import type { TransportNotice, TransportStatus } from '../types/common'
import type { OperationType } from '../types/common'

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

export class APIContractError extends Error {
  readonly code = 'INVALID_RESPONSE' as const;

  constructor(readonly endpoint: string, detail: string, readonly cause?: unknown) {
    super(`Invalid ${endpoint} response: ${detail}`);
    this.name = 'APIContractError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class APIInputError extends Error {
  readonly code = 'INVALID_INPUT' as const;

  constructor(readonly operation: string, detail: string) {
    super(`${operation}: ${detail}`);
    this.name = 'APIInputError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function assertModelSupportsOperation(
  models: Readonly<Record<string, ModelInfo>>,
  model: string,
  operation: OperationType,
): void {
  const modelInfo = models[model];
  if (!modelInfo) throw new APIInputError(operation, `model '${model}' is not available`);
  if (!modelInfo.capabilities.includes(operation)) {
    throw new APIInputError(operation, `model '${model}' does not support this operation`);
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
  if (error instanceof APIContractError) return false;
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
      try {
        return await response.json() as T;
      } catch (error) {
        throw new APIContractError(new URL(url).pathname, 'body is not valid JSON', error);
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function contractError(endpoint: string, detail: string): APIContractError {
  return new APIContractError(endpoint, detail);
}

function parseModelsResponse(value: unknown): ModelsResponse {
  if (!isRecord(value) || !isRecord(value.models)) {
    throw contractError('/models', 'models must be an object');
  }
  for (const [name, capabilities] of Object.entries(value.models)) {
    if (!name || !isStringArray(capabilities)) {
      throw contractError('/models', 'each model must have a string capability list');
    }
  }
  if (value.default_model !== undefined && !isString(value.default_model)) {
    throw contractError('/models', 'default_model must be a string when present');
  }
  if (value.acknowledgements !== undefined && !isStringArray(value.acknowledgements)) {
    throw contractError('/models', 'acknowledgements must be a string list when present');
  }
  return value as unknown as ModelsResponse;
}

function parseMorphologicalTag(value: unknown): value is MorphologicalTag {
  return isRecord(value) && isString(value.lemma) && isString(value.tag);
}

function parseOperationResponse<T>(
  value: unknown,
  endpoint: string,
  rowValidator: (row: unknown) => boolean,
): T {
  if (!isRecord(value) || !isString(value.model) || !Array.isArray(value.result)) {
    throw contractError(endpoint, 'model and result are required');
  }
  if (!value.result.every((row) => Array.isArray(row) && row.every(rowValidator))) {
    throw contractError(endpoint, 'result rows do not match the LINDA schema');
  }
  return value as T;
}

function parseTagResponse(value: unknown): TagResponse {
  return parseOperationResponse<TagResponse>(value, '/tag', (row) =>
    isRecord(row) && isString(row.token) && isString(row.lemma) && isString(row.tag) &&
    (row.space === undefined || isString(row.space))
  );
}

function parseAnalyzeToken(value: unknown): value is AnalyzeToken {
  return isRecord(value) && isString(value.token) && Array.isArray(value.analyses) &&
    value.analyses.every(parseMorphologicalTag) &&
    (value.space === undefined || isString(value.space));
}

function parseAnalyzeResponse(value: unknown): AnalyzeResponse {
  return parseOperationResponse<AnalyzeResponse>(value, '/analyze', parseAnalyzeToken);
}

function parseGenerateResponse(value: unknown): GenerateResponse {
  return parseOperationResponse<GenerateResponse>(value, '/generate', (row) =>
    isRecord(row) && isString(row.form) && isString(row.lemma) && isString(row.tag)
  );
}

function parseTokenizeResponse(value: unknown): TokenizeResponse {
  return parseOperationResponse<TokenizeResponse>(value, '/tokenize', (row) =>
    isRecord(row) && isString(row.token) && (row.space === undefined || isString(row.space))
  );
}

function requireOperationInput(operation: string, data: string, model: string): void {
  if (!isString(data) || !data.trim()) throw new APIInputError(operation, 'input text is required');
  if (!isString(model) || !model.trim()) throw new APIInputError(operation, 'model is required');
}

function requireOption<T extends string>(operation: string, name: string, value: T, allowed: readonly T[]): void {
  if (!allowed.includes(value)) throw new APIInputError(operation, `${name} is not supported`);
}

export function normalizeAnalyzeResult(
  result: AnalyzeResponse['result'],
): Array<Array<MorphologicalTag & { token: string; space?: string }>> {
  return result.map((sentence) => sentence.flatMap((item) => item.analyses.map((analysis) => ({
    ...analysis,
    token: item.token,
    ...(item.space === undefined ? {} : { space: item.space }),
  }))));
}

function isOfflineFallbackEligible(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false;
  if (error instanceof APIContractError) return false;
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
  async getModels(options: ApiRequestOptions = {}): Promise<{ models: { [key: string]: ModelInfo }; defaultModel?: string }> {
    const base = await getBaseUrl()
    const response = parseModelsResponse(await fetchWithRetry<unknown>(`${base}/models?output=json`, {
      signal: options.signal,
    }));
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

    return response.default_model
      ? { models: transformedModels, defaultModel: response.default_model }
      : { models: transformedModels };
  },

  async tagText(data: string, model: string, output: 'json' | 'xml' | 'vertical' = 'json', options: ApiRequestOptions = {}): Promise<TagResponse> {
    requireOperationInput('tag', data, model);
    requireOption('tag', 'output', output, ['json', 'xml', 'vertical']);
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)

    return parseTagResponse(await fetchWithRetry<unknown>(`${base}/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    }))
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
    requireOperationInput('analyze', data, model);
    requireOption('analyze', 'input', inputFormat, ['untokenized', 'vertical']);
    requireOption('analyze', 'derivation', derivation, ['none', 'root', 'path', 'tree']);
    requireOption('analyze', 'output', output, ['json', 'xml', 'vertical']);
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)
    params.append('guesser', guesser ? 'yes' : 'no')
    params.append('input', inputFormat)
    if (derivation !== 'none') params.append('derivation', derivation)
    if (convertTagset) params.append('convert_tagset', convertTagset)

    return parseAnalyzeResponse(await fetchWithRetry<unknown>(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    }))
  },

  async generateForms(
    data: string,
    model: string,
    guesser: boolean = true,
    convertTagset?: string,
    output: 'json' | 'xml' | 'vertical' = 'json',
    options: ApiRequestOptions = {},
  ): Promise<GenerateResponse> {
    requireOperationInput('generate', data, model);
    requireOption('generate', 'output', output, ['json', 'xml', 'vertical']);
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)
    params.append('guesser', guesser ? 'yes' : 'no')
    if (convertTagset) params.append('convert_tagset', convertTagset)

    return parseGenerateResponse(await fetchWithRetry<unknown>(`${base}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    }))
  },

  async tokenizeText(data: string, model: string, output: 'json' | 'xml' | 'vertical' = 'json', options: ApiRequestOptions = {}): Promise<TokenizeResponse> {
    requireOperationInput('tokenize', data, model);
    requireOption('tokenize', 'output', output, ['json', 'xml', 'vertical']);
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)

    return parseTokenizeResponse(await fetchWithRetry<unknown>(`${base}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: options.signal,
    }))
  },
}
