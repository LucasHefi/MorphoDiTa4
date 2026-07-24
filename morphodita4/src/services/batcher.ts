import { useAppStore } from '../store/useAppStore'

export function splitText(input: string, batchSize: number = 50): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  const hasNewlines = /\n/.test(trimmed)
  if (hasNewlines) {
    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const chunks: string[] = []
    for (let i = 0; i < lines.length; i += batchSize) {
      chunks.push(lines.slice(i, i + batchSize).join('\n'))
    }
    return chunks
  }
  const words = trimmed.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += batchSize) {
    chunks.push(words.slice(i, i + batchSize).join(' '))
  }
  return chunks
}

export interface BatchProcessingOptions {
  signal?: AbortSignal;
  partialFailure?: 'fail-fast' | 'continue';
  onError?: (error: unknown, index: number, chunk: string) => void;
}

export const BATCH_DELAY_MS = 100;

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function waitForBatchDelay(delay: number, signal?: AbortSignal): Promise<void> {
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

export async function processInBatches<T>(
  chunks: string[],
  processor: (chunk: string) => Promise<T>,
  onProgress?: (i: number) => void,
  options: BatchProcessingOptions = {},
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (options.signal?.aborted) throw createAbortError();

    try {
      results.push(await processor(chunk));
    } catch (error) {
      if (options.signal?.aborted) throw createAbortError();
      if (options.partialFailure !== 'continue') throw error;
      options.onError?.(error, i, chunk);
    }

    onProgress?.(i + 1);
    if (i < chunks.length - 1) {
      await waitForBatchDelay(BATCH_DELAY_MS, options.signal);
    }
  }
  return results;
}

export function getBatchSize(): number {
  return useAppStore.getState().apiBatchSize || 50
}
