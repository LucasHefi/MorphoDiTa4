import { ModelsResponse, GenerateResponse, AnalyzeResponse, TagResponse, TokenizeResponse, ModelInfo } from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { OfflineSidecar } from './offlineSidecar'

async function getBaseUrl(): Promise<string> {
  const { useOfflineMode } = useAppStore.getState()
  if (useOfflineMode) {
    const off = OfflineSidecar.getCurrentOfflineBaseUrl()
    if (off) return off
    const started = await OfflineSidecar.start()
    if (started) return started
  }
  return 'https://lindat.mff.cuni.cz/services/morphodita/api'
}

export class APIError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'APIError'
  }
}

async function fetchWithRetry<T>(url: string, options: RequestInit = {}, retries = 3, backoff = 1000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error detail');
      throw new APIError(`HTTP error! status: ${response.status}. Detail: ${errorText}`, response.status)
    }
    const data = await response.json()
    return data as T
  } catch (error) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff))
      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }
    throw error
  }
}

export const MorphoDiTaAPI = {
  async getModels(): Promise<{ models: { [key: string]: ModelInfo } }> {
    const base = await getBaseUrl()
    const response = await fetchWithRetry<ModelsResponse>(`${base}/models?output=json`);
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

  async tagText(data: string, model: string, output: 'json' | 'xml' | 'vertical' = 'json'): Promise<TagResponse> {
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)

    return fetchWithRetry<TagResponse>(`${base}/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
  },

  async analyzeText(
    data: string,
    model: string,
    guesser: boolean = true,
    inputFormat: 'untokenized' | 'vertical' = 'untokenized',
    derivation: 'none' | 'root' | 'path' | 'tree' = 'none',
    convertTagset?: string,
    output: 'json' | 'xml' | 'vertical' = 'json'
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
    })
  },

  async generateForms(
    data: string,
    model: string,
    guesser: boolean = true,
    convertTagset?: string,
    output: 'json' | 'xml' | 'vertical' = 'json'
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
    })
  },

  async tokenizeText(data: string, model: string, output: 'json' | 'xml' | 'vertical' = 'json'): Promise<TokenizeResponse> {
    const base = await getBaseUrl()
    const params = new URLSearchParams()
    params.append('data', data)
    params.append('model', model)
    params.append('output', output)

    return fetchWithRetry<TokenizeResponse>(`${base}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
  },
}
