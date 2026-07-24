import { describe, it, expect, vi } from 'vitest';
import { splitText, processInBatches } from './batcher';

describe('splitText', () => {
  it('returns empty array for empty input', () => {
    expect(splitText('')).toEqual([]);
    expect(splitText('   ')).toEqual([]);
    expect(splitText('\n\n\n')).toEqual([]);
  });

  it('splits space-separated words into chunks', () => {
    const input = 'a b c d e';
    const result = splitText(input, 2);
    expect(result).toEqual(['a b', 'c d', 'e']);
  });

  it('splits newline-separated text into chunks', () => {
    const input = 'line1\nline2\nline3\nline4\nline5';
    const result = splitText(input, 2);
    expect(result).toEqual(['line1\nline2', 'line3\nline4', 'line5']);
  });

  it('uses default batch size of 50', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`);
    const result = splitText(words.join(' '));
    expect(result).toHaveLength(3);
    expect(result[0].split(' ')).toHaveLength(50);
    expect(result[1].split(' ')).toHaveLength(50);
    expect(result[2].split(' ')).toHaveLength(20);
  });

  it('handles single word input', () => {
    expect(splitText('hello')).toEqual(['hello']);
  });

  it('trims whitespace from input', () => {
    expect(splitText('  hello world  ')).toEqual(['hello world']);
  });

  it('filters empty lines', () => {
    const input = 'line1\n\n\nline2\n\nline3';
    const result = splitText(input, 10);
    expect(result).toEqual(['line1\nline2\nline3']);
  });

  it('prefers newline splitting over space splitting', () => {
    const input = 'word1 word2\nword3 word4';
    const result = splitText(input, 10);
    // Should split by newlines, not spaces
    expect(result).toEqual(['word1 word2\nword3 word4']);
  });
});

describe('processInBatches', () => {
  it('processes all chunks and returns results', async () => {
    const chunks = ['a', 'b', 'c'];
    const processor = vi.fn(async (chunk: string) => chunk.toUpperCase());

    const results = await processInBatches(chunks, processor);
    expect(results).toEqual(['A', 'B', 'C']);
    expect(processor).toHaveBeenCalledTimes(3);
    expect(processor).toHaveBeenCalledWith('a');
    expect(processor).toHaveBeenCalledWith('b');
    expect(processor).toHaveBeenCalledWith('c');
  });

  it('calls onProgress callback with correct indices', async () => {
    const chunks = ['a', 'b', 'c'];
    const processor = vi.fn(async (chunk: string) => chunk);
    const onProgress = vi.fn();

    await processInBatches(chunks, processor, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(onProgress).toHaveBeenCalledWith(2);
    expect(onProgress).toHaveBeenCalledWith(3);
  });

  it('returns empty array for empty chunks', async () => {
    const processor = vi.fn(async (chunk: string) => chunk);
    const results = await processInBatches([], processor);
    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it('processes single chunk without delay', async () => {
    const chunks = ['only-one'];
    const processor = vi.fn(async (chunk: string) => chunk);
    const onProgress = vi.fn();

    const results = await processInBatches(chunks, processor, onProgress);

    expect(results).toEqual(['only-one']);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('propagates processor errors', async () => {
    const chunks = ['ok', 'fail', 'ok'];
    const processor = vi.fn(async (chunk: string) => {
      if (chunk === 'fail') throw new Error('Processing failed');
      return chunk;
    });

    await expect(processInBatches(chunks, processor)).rejects.toThrow('Processing failed');
  });

  it('handles async processor with varying results', async () => {
    const chunks = ['1', '2', '3'];
    const processor = vi.fn(async (chunk: string) => parseInt(chunk) * 10);

    const results = await processInBatches(chunks, processor);
    expect(results).toEqual([10, 20, 30]);
  });

  it('continues after a partial failure when explicitly configured', async () => {
    vi.useFakeTimers();
    try {
      const processor = vi.fn(async (chunk: string) => {
        if (chunk === 'fail') throw new Error('partial failure');
        return chunk.toUpperCase();
      });
      const onError = vi.fn();
      const onProgress = vi.fn();
      const request = processInBatches(
        ['ok', 'fail', 'last'],
        processor,
        onProgress,
        { partialFailure: 'continue', onError },
      );

      await vi.runAllTimersAsync();
      await expect(request).resolves.toEqual(['OK', 'LAST']);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 1, 'fail');
      expect(onProgress.mock.calls.map(([value]) => value)).toEqual([1, 2, 3]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels processing and pending rate-limit delay', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const processor = vi.fn(async (chunk: string) => chunk);
      const request = processInBatches(
        ['first', 'second'],
        processor,
        undefined,
        { signal: controller.signal },
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(processor).toHaveBeenCalledTimes(1);
      controller.abort();
      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
      expect(processor).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces the inter-batch rate-limit delay', async () => {
    vi.useFakeTimers();
    try {
      const processor = vi.fn(async (chunk: string) => chunk);
      const request = processInBatches(['first', 'second'], processor);
      await vi.advanceTimersByTimeAsync(0);
      expect(processor).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(processor).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(request).resolves.toEqual(['first', 'second']);
      expect(processor).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles large inputs without losing chunks', () => {
    const input = Array.from({ length: 10000 }, (_, index) => `word${index}`).join(' ');
    const chunks = splitText(input, 50);
    expect(chunks).toHaveLength(200);
    expect(chunks.flatMap((chunk) => chunk.split(' '))).toHaveLength(10000);
  });
});