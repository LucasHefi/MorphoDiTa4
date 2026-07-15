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

export async function processInBatches<T>(
  chunks: string[],
  processor: (chunk: string) => Promise<T>,
  onProgress?: (i: number) => void
): Promise<T[]> {
  const results: T[] = []
  const delay = 100
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const res = await processor(chunk)
    results.push(res)
    if (onProgress) onProgress(i + 1)
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return results
}

export function getBatchSize(): number {
  return useAppStore.getState().apiBatchSize || 50
}
