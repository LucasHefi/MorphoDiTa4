import {
  AnalyzeResponse,
  AnalyzeToken,
  GenerateResponse,
  ModelInfo,
  ModelsResponse,
  MorphologicalTag,
  TagResponse,
  TokenizeResponse,
  APIErrorCode,
  APIErrorShape,
  ModelCapability,
} from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { OfflineSidecar } from './offlineSidecar'
import type { TransportNotice, TransportStatus } from '../types/common'
import type { OperationType } from '../types/common'

const ONLINE_API_BASE_URL = 'https://lindat.mff.cuni.cz/services/morphodita/api';
// Keep server-provided retry delays bounded so one response cannot stall retries indefinitely.
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;
const MAX_SCHEMA_DEPTH = 256;
const MAX_SCHEMA_NODES = 100_000;
const MAX_SCHEMA_STRING_BYTES = 16 * 1024 * 1024;
const MAX_SCHEMA_ARRAY_LENGTH = 100_000;

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

export class APIError extends Error implements APIErrorShape {
  constructor(
    message: string,
    public readonly code: APIErrorCode,
    public readonly endpoint: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'APIError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class APIContractError extends APIError {

  constructor(endpoint: string, detail: string, code: 'INVALID_JSON' | 'SCHEMA_MISMATCH' = 'SCHEMA_MISMATCH', cause?: unknown) {
    super(`Invalid ${endpoint} response: ${detail}`, code, endpoint, false, undefined, undefined, cause);
    this.name = 'APIContractError';
  }
}

export class APIInputError extends APIError {

  constructor(readonly operation: string, detail: string, code: 'INVALID_INPUT' | 'UNSUPPORTED_OUTPUT' = 'INVALID_INPUT') {
    super(`${operation}: ${detail}`, code, `/${operation}`, false);
    this.name = 'APIInputError';
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

export class APITransportError extends APIError {
  readonly onlineError: unknown;
  readonly offlineError: unknown;

  constructor(endpoint: string, onlineError: unknown, offlineError: unknown) {
    super('The online API is unavailable and the local MorphoDiTa fallback could not be started.', 'OFFLINE_UNAVAILABLE', endpoint, false, undefined, undefined, offlineError);
    this.name = 'APITransportError';
    this.onlineError = onlineError;
    this.offlineError = offlineError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type ApiRequestOptions = { signal?: AbortSignal };

function parseRetryAfter(value: string | null): number | undefined {
  if (!value || !value.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, seconds * 1000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()))
    : undefined;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof APIContractError) return false;
  if (!(error instanceof APIError)) return false;
  return error.retryable;
}

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function jitteredBackoff(backoff: number): number {
  const safeBackoff = Number.isFinite(backoff) ? Math.max(0, backoff) : 0;
  const sample = Math.min(1, Math.max(0, Math.random()));
  const delay = safeBackoff * (0.5 + sample);
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

function endpointFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const endpoint = ['/models', '/tag', '/analyze', '/generate', '/tokenize'].find((suffix) => pathname.endsWith(suffix));
  return endpoint ?? pathname;
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
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok) {
        const endpoint = endpointFromUrl(url);
        const errorText = await readResponseBody(response, endpoint).catch(() => 'No error detail');
        throw new APIError(
          `HTTP error! status: ${response.status}. Detail: ${errorText}`,
          'HTTP_STATUS',
          endpoint,
          response.status === 429 || (response.status >= 500 && response.status <= 599),
          response.status,
          parseRetryAfter(response.headers?.get('retry-after') ?? null),
        );
      }
      try {
        const body = await readResponseBody(response, endpointFromUrl(url));
        const parsed = JSON.parse(body) as unknown;
        preflightSchema(parsed, endpointFromUrl(url));
        return parsed as T;
      } catch (error) {
        if (error instanceof APIContractError) throw error;
        throw new APIContractError(endpointFromUrl(url), 'body is not valid JSON', 'INVALID_JSON', error);
      }
    } catch (error) {
      if (externalSignal?.aborted) throw createAbortError();
      const endpoint = endpointFromUrl(url);
      const normalizedError = error instanceof APIError ? error : new APIError(
        timedOut ? `Request to ${endpoint} timed out` : `Network request to ${endpoint} failed`,
        timedOut ? 'TIMEOUT' : 'NETWORK', endpoint, true, undefined, undefined, error,
      );
      if (retries <= 0 || !isRetryable(normalizedError)) throw normalizedError;
      const retryAfter = normalizedError.retryAfterMs;
      const delay = Math.max(jitteredBackoff(backoff), Number.isFinite(retryAfter) ? Math.max(0, retryAfter!) : 0);
      retries -= 1;
      backoff *= 2;
      await waitForRetry(delay, externalSignal);
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

async function readResponseBody(response: Response, endpoint: string): Promise<string> {
  const declaredLength = response.headers?.get('content-length');
  const contentLength = declaredLength === null || declaredLength === undefined ? NaN : Number(declaredLength);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BODY_BYTES) {
    throw contractError(endpoint, 'response body exceeds the 64 MiB maximum');
  }
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let body = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > MAX_RESPONSE_BODY_BYTES) {
          throw contractError(endpoint, 'response body exceeds the 64 MiB maximum');
        }
        body += decoder.decode(value, { stream: true });
      }
      return body + decoder.decode();
    } catch (error) {
      try { await reader.cancel(error); } catch { /* best effort cleanup */ }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  if (typeof response.text !== 'function') {
    // Keep compatibility with lightweight test transports that only implement json().
    return JSON.stringify(await response.json());
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BODY_BYTES) {
    throw contractError(endpoint, 'response body exceeds the 64 MiB maximum');
  }
  return body;
}

function preflightSchema(value: unknown, endpoint: string): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const item = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_SCHEMA_NODES || item.depth > MAX_SCHEMA_DEPTH) {
      throw contractError(endpoint, 'response exceeds schema depth or node limits');
    }
    if (typeof item.value === 'string') {
      if (new TextEncoder().encode(item.value).byteLength > MAX_SCHEMA_STRING_BYTES) {
        throw contractError(endpoint, 'response contains an oversized string');
      }
      continue;
    }
    if (Array.isArray(item.value)) {
      if (item.value.length > MAX_SCHEMA_ARRAY_LENGTH) {
        throw contractError(endpoint, 'response contains an oversized array');
      }
      for (const child of item.value) pending.push({ value: child, depth: item.depth + 1 });
    } else if (isRecord(item.value)) {
      for (const [key, child] of Object.entries(item.value)) {
        if (new TextEncoder().encode(key).byteLength > MAX_SCHEMA_STRING_BYTES) {
          throw contractError(endpoint, 'response contains an oversized property name');
        }
        pending.push({ value: child, depth: item.depth + 1 });
      }
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

function isCapabilityArray(value: unknown): value is ModelCapability[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) =>
    item === 'tag' || item === 'analyze' || item === 'generate' || item === 'tokenize'
  ) && new Set(value).size === value.length;
}

function contractError(endpoint: string, detail: string): APIContractError {
  return new APIContractError(endpoint, detail, 'SCHEMA_MISMATCH');
}

function parseModelsResponse(value: unknown): ModelsResponse {
  if (!isRecord(value) || !isRecord(value.models)) {
    throw contractError('/models', 'models must be an object');
  }
  for (const [name, capabilities] of Object.entries(value.models)) {
    if (!name || !isCapabilityArray(capabilities)) {
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
  return isRecord(value) && isString(value.lemma) && isString(value.tag) &&
    (value.form === undefined || isString(value.form)) &&
    (value.probability === undefined || typeof value.probability === 'number') &&
    (value.space === undefined || isString(value.space));
}

function parseOperationResponse<T>(
  value: unknown,
  endpoint: string,
  rowValidator: (row: unknown) => boolean,
): T {
  if (!isRecord(value) || !isString(value.model) || !Array.isArray(value.result) ||
    (value.acknowledgements !== undefined && !isStringArray(value.acknowledgements))) {
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
    isRecord(row) && isString(row.form) && isString(row.lemma) && isString(row.tag) &&
    (row.probability === undefined || typeof row.probability === 'number') &&
    (row.space === undefined || isString(row.space))
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

function requireJsonOutput(operation: string, output: string): asserts output is 'json' {
  if (output !== 'json') throw new APIInputError(operation, 'only JSON output is supported by this adapter', 'UNSUPPORTED_OUTPUT');
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
    return error.code === 'NETWORK' || error.code === 'TIMEOUT' || error.retryable;
  }
  return true;
}

function replaceBaseUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url);
  const onlinePath = new URL(ONLINE_API_BASE_URL).pathname;
  const endpoint = parsed.pathname.startsWith(`${onlinePath}/`)
    ? parsed.pathname.slice(onlinePath.length)
    : undefined;
  const allowedEndpoints = ['/models', '/tag', '/analyze', '/generate', '/tokenize'];
  if (!endpoint || !allowedEndpoints.includes(endpoint)) {
    throw new Error(`Cannot construct offline URL for unknown endpoint: ${parsed.pathname}`);
  }
  return `${baseUrl.replace(/\/$/, '')}${endpoint}${parsed.search}`;
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
      throw new APITransportError(endpointFromUrl(url), onlineError, offlineError);
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
    requireJsonOutput('tag', output);
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
    requireJsonOutput('analyze', output);
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
    requireJsonOutput('generate', output);
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
    requireJsonOutput('tokenize', output);
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
