import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiStore } from '../../store/useApiStore';
import { useWizardStore } from '../../store/useWizardStore';
import { DatabaseService } from '../../services/database';
import { MorphoDiTaAPI } from '../../services/api';
import { WizardProcessing } from './WizardProcessing';
import { StrictMode } from 'react';
import { selectWizardSources } from './wizardSummarySelectors';
import { applyFiltersToArray } from '../../services/filters';
import { useAppStore } from '../../store/useAppStore';

const token = (inputToken: string, lemma: string) => ({ token: inputToken, lemma, tag: 'N' });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../services/database', () => ({
  DatabaseService: { wordFormsExist: vi.fn() },
}));

vi.mock('../../services/api', () => ({
  MorphoDiTaAPI: { tagText: vi.fn(), generateForms: vi.fn() },
}));

describe('WizardProcessing recovery', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    useWizardStore.getState().reset();
    useApiStore.setState({ selectedModel: null });
    useAppStore.setState({ apiBatchSize: 50 });
    vi.mocked(DatabaseService.wordFormsExist).mockResolvedValue([]);
    vi.mocked(MorphoDiTaAPI.tagText).mockResolvedValue({ result: [[{ token: 'cat', lemma: 'cat', tag: 'N' }]] } as never);
    vi.mocked(MorphoDiTaAPI.generateForms).mockResolvedValue({ result: [[{ form: 'cats', lemma: 'cat', tag: 'N' }]] } as never);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    useWizardStore.getState().reset();
    useApiStore.setState({ selectedModel: null });
    useAppStore.setState({ apiBatchSize: 50 });
  });

  it('fails visibly when no model is selected', async () => {
    useWizardStore.setState({ keywordsText: 'cat' });
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('failed');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('wizard.processing_error');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('wizard.resume'))).toBe(true);
  });

  it('does not report whitespace-only parsed input as finished', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: ' \n\t ' });
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('failed');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const nextButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.next'));
    expect(nextButton?.disabled).toBe(true);
  });

  it('fails visibly when the input is empty', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('failed');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('retries a failed run when resume changes the persisted status', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat', run: { status: 'failed', sessionId: 'failed-session', completedPhase: 'none', error: 'first failure' } });
    vi.mocked(MorphoDiTaAPI.tagText).mockResolvedValue({ result: [[{ token: 'cat', lemma: 'cat', tag: 'N' }]] } as never);
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(MorphoDiTaAPI.tagText).not.toHaveBeenCalled();
    const resumeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.resume'));
    expect(resumeButton).toBeDefined();
    flushSync(() => resumeButton?.click());
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(1);
    expect(useWizardStore.getState().run.status).toBe('ready');
    expect(useWizardStore.getState().run.sessionId).not.toBe('failed-session');
  });

  it('resumes from analysis without repeating lookup or tagging', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat', run: {
      status: 'cancelled', sessionId: 'session-resume', completedPhase: 'analysis',
      checkpoint: {
        source: { input: 'cat', model: 'model' },
        lookup: { newWords: ['cat'] },
        analysis: { taggedTokens: [{ token: 'cat', lemma: 'cat', tag: 'N' }], lemmas: ['cat'] },
      },
    } });
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(DatabaseService.wordFormsExist).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.tagText).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.generateForms).not.toHaveBeenCalled();
    const resumeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.resume'));
    flushSync(() => resumeButton?.click());
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(DatabaseService.wordFormsExist).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.tagText).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
    expect(useWizardStore.getState().run).toMatchObject({ status: 'ready', sessionId: 'session-resume' });
  });

  it('cancels an in-flight analysis without accepting its late result', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat' });
    vi.mocked(MorphoDiTaAPI.tagText).mockImplementation((_chunk, _model, _output, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.cancel'));
    flushSync(() => cancelButton?.click());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('cancelled');
    expect(useWizardStore.getState().processingResult).toBeNull();
  });

  it('cancels an in-flight generation request', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat' });
    vi.mocked(MorphoDiTaAPI.generateForms).mockImplementation((_chunk, _model, _guesser, _tagset, _output, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.cancel'));
    flushSync(() => cancelButton?.click());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('cancelled');
    expect(useWizardStore.getState().processingResult).toBeNull();
  });

  it('ignores a database result after unmount', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat' });
    let resolveLookup!: (words: string[]) => void;
    vi.mocked(DatabaseService.wordFormsExist).mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => root.unmount());
    resolveLookup([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().processingResult).toBeNull();
  });

  it('completes exactly one logical run under StrictMode', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat' });
    flushSync(() => root.render(<StrictMode><WizardProcessing /></StrictMode>));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(useWizardStore.getState().run.status).toBe('ready');
    expect(useWizardStore.getState().processingResult?.model).toBe('model');
    expect(useWizardStore.getState().processingResult?.relations[0]?.sessionId).toBe(useWizardStore.getState().run.sessionId);
    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(1);
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
  });

  it('tags each unique word once and expands four ordered provenance rows', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'Cat cat DOG dog' });
    vi.mocked(MorphoDiTaAPI.tagText).mockImplementation(async (chunk) => ({
      result: [chunk.split('\n').map((word) => token(word.toLowerCase(), word.toLowerCase()))],
    } as never));
    vi.mocked(MorphoDiTaAPI.generateForms).mockImplementation(async (chunk) => ({
      result: chunk.split('\n').map((lemma) => [{ form: `${lemma}s`, lemma, tag: 'N' }]),
    } as never));

    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(1);
    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledWith('Cat\nDOG', 'model', 'json', expect.objectContaining({ inputFormat: 'vertical' }));
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
    const result = useWizardStore.getState().processingResult!;
    expect(result.inputWords).toBe(4);
    expect(result.taggedTokens.map(({ token }) => token)).toEqual(['Cat', 'cat', 'DOG', 'dog']);
    expect(result.relations.map(({ inputToken }) => inputToken)).toEqual(['Cat', 'cat', 'DOG', 'dog']);
    expect(selectWizardSources(result.taggedTokens, result.forms, false, new Set(), new Set()).taggedTokens).toHaveLength(4);
    expect(applyFiltersToArray(result.taggedTokens.map(({ token }) => token), { removeDuplicates: true })).toEqual(['Cat', 'DOG']);
    expect(useWizardStore.getState().run.checkpoint?.analysis?.taggedTokens.map(({ token }) => token)).toEqual(['Cat', 'cat', 'DOG', 'dog']);
  });

  it('reports deterministic within-phase progress across delayed batches', async () => {
    vi.useFakeTimers();
    useApiStore.setState({ selectedModel: 'model' });
    useAppStore.setState({ apiBatchSize: 2 });
    useWizardStore.setState({ keywordsText: 'one two three four' });
    vi.mocked(MorphoDiTaAPI.tagText).mockImplementation(async (chunk) => ({
      result: chunk.split('\n').map((word) => [token(word, word)]),
    } as never));
    let resolveFirstGeneration!: (response: unknown) => void;
    vi.mocked(MorphoDiTaAPI.generateForms).mockImplementation(async (chunk) => {
      if (vi.mocked(MorphoDiTaAPI.generateForms).mock.calls.length === 1) {
        return new Promise((resolve) => {
          resolveFirstGeneration = resolve;
        }) as never;
      }
      return {
        result: chunk.split('\n').map((lemma) => [{ form: `${lemma}s`, lemma, tag: 'N' }]),
      } as never;
    });

    flushSync(() => root.render(<WizardProcessing />));
    await vi.advanceTimersByTimeAsync(0);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('35');
    await vi.advanceTimersByTimeAsync(100);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    resolveFirstGeneration({ result: [['one', 'two'].map((lemma) => ({ form: `${lemma}s`, lemma, tag: 'N' }))] });
    await vi.advanceTimersByTimeAsync(0);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('65');
    await vi.advanceTimersByTimeAsync(99);
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('removes digits before database lookup and linguistic requests', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: '123 pes12 45kočka pes99' });
    vi.mocked(MorphoDiTaAPI.tagText).mockResolvedValue({ result: [[token('pes', 'pes'), token('kočka', 'kočka')]] } as never);
    vi.mocked(MorphoDiTaAPI.generateForms).mockResolvedValue({ result: [] } as never);
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(DatabaseService.wordFormsExist).toHaveBeenCalledWith(['pes', 'kočka']);
    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledWith('pes\nkočka', 'model', 'json', expect.anything());
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledWith('pes\nkočka', 'model', true, undefined, 'json', expect.anything());
    expect(useWizardStore.getState().run.status).toBe('ready');
  });

  it('does not send digits from a returned lemma to generation and retains the relationship', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'slovo' });
    vi.mocked(MorphoDiTaAPI.tagText).mockResolvedValue({ result: [[token('slovo', 'lemma9')]] } as never);
    vi.mocked(MorphoDiTaAPI.generateForms).mockResolvedValue({ result: [[{ form: 'slova', lemma: 'lemma', tag: 'N' }]] } as never);
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledWith('lemma', 'model', true, undefined, 'json', expect.anything());
    expect(useWizardStore.getState().processingResult?.relations[0].generatedForms).toHaveLength(1);
  });

  it('processes 1000000 words in bounded batches exactly once', async () => {
    vi.useFakeTimers({ loopLimit: 100_000 });
    useApiStore.setState({ selectedModel: 'model' });
    useAppStore.setState({ apiBatchSize: 50 });
    const words = Array.from({ length: 1000000 }, (_, index) => `word${Array.from({ length: 5 }, (_, digit) => String.fromCharCode(97 + Math.floor(index / (26 ** digit)) % 26)).join('')}`);
    useWizardStore.setState({ keywordsText: words.join(' ') });
    vi.mocked(MorphoDiTaAPI.tagText).mockImplementation(async (chunk) => ({
      result: chunk.split('\n').map((word) => [token(word, word)]),
    } as never));
    vi.mocked(MorphoDiTaAPI.generateForms).mockImplementation(async (chunk) => ({
      result: chunk.split('\n').map((lemma) => [{ form: `${lemma}s`, lemma, tag: 'N' }]),
    } as never));

    flushSync(() => root.render(<WizardProcessing />));
    await vi.runAllTimersAsync();

    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(20000);
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(20000);
    expect(useWizardStore.getState().run.status).toBe('ready');
    expect(useWizardStore.getState().processingResult?.inputWords).toBe(1000000);
  }, 120_000);

  it('fails with the tagging contract error on an unmappable response', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'Cat cat DOG dog' });
    vi.mocked(MorphoDiTaAPI.tagText).mockResolvedValue({ result: [[{ token: 'cat', lemma: 'cat', tag: 'N' }]] } as never);

    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(useWizardStore.getState().run.status).toBe('failed');
    expect(useWizardStore.getState().run.error).toBe('wizard.processing.taggingContractMismatch');
  });

  it('resumes from expanded analysis without lookup or tagging', async () => {
    useApiStore.setState({ selectedModel: 'model' });
    const taggedTokens = [token('Cat', 'cat'), token('cat', 'cat'), token('DOG', 'dog'), token('dog', 'dog')];
    useWizardStore.setState({ keywordsText: 'Cat cat DOG dog', run: {
      status: 'cancelled', sessionId: 'expanded-session', completedPhase: 'analysis',
      checkpoint: { source: { input: 'Cat cat DOG dog', model: 'model' }, lookup: { newWords: ['Cat', 'DOG'] }, analysis: { taggedTokens, lemmas: ['cat', 'dog'] } },
    } });

    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const resumeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.resume'));
    flushSync(() => resumeButton?.click());
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(DatabaseService.wordFormsExist).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.tagText).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
    expect(useWizardStore.getState().processingResult?.taggedTokens.map(({ token }) => token)).toEqual(['Cat', 'cat', 'DOG', 'dog']);
  });

  it('invalidates a checkpoint and creates a new session when the model changes', async () => {
    useApiStore.setState({ selectedModel: 'new-model' });
    useWizardStore.setState({ keywordsText: 'cat', processingResult: { inputWords: 1, newWords: ['cat'], uniqueLemmas: 1, lemmas: ['cat'], forms: [], taggedTokens: [], relations: [], model: 'old-model' }, run: {
      status: 'cancelled', sessionId: 'old-session', completedPhase: 'analysis', checkpoint: {
        source: { input: 'cat', model: 'old-model' }, lookup: { newWords: ['cat'] },
      },
    } });
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(useWizardStore.getState().run.sessionId).not.toBe('old-session');
    expect(useWizardStore.getState().run.status).toBe('ready');
    expect(DatabaseService.wordFormsExist).toHaveBeenCalledTimes(1);
  });

  it.each(['ready', 'saved'] as const)('restores %s as completed without rerunning work after remount', async (status) => {
    useApiStore.setState({ selectedModel: 'model' });
    useWizardStore.setState({ keywordsText: 'cat', processingResult: {
      inputWords: 1, newWords: ['cat'], uniqueLemmas: 1, lemmas: ['cat'],
      forms: [{ form: 'cats', lemma: 'cat', tag: 'N' }],
      taggedTokens: [{ token: 'cat', lemma: 'cat', tag: 'N' }], relations: [], model: 'model',
    }, run: {
      status, sessionId: 'persisted-session', completedPhase: status,
      checkpoint: {
        source: { input: 'cat', model: 'model' }, lookup: { newWords: ['cat'] },
        analysis: { taggedTokens: [{ token: 'cat', lemma: 'cat', tag: 'N' }], lemmas: ['cat'] },
        generation: { forms: [{ form: 'cats', lemma: 'cat', tag: 'N' }] },
      },
    } });
    flushSync(() => root.render(<WizardProcessing />));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(DatabaseService.wordFormsExist).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.tagText).not.toHaveBeenCalled();
    expect(MorphoDiTaAPI.generateForms).not.toHaveBeenCalled();
     expect(container.textContent).toContain('wizard.processing.complete');
    const nextButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.next'));
    expect(nextButton?.disabled).toBe(false);
  });
});
