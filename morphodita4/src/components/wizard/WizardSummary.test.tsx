import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWizardStore } from '../../store/useWizardStore';
import { useApiStore } from '../../store/useApiStore';
import { WorkflowService } from '../../services/workflow';
import { WizardSummary } from './WizardSummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../services/workflow', () => ({
  WorkflowService: { saveWizardResults: vi.fn() },
}));

const processingResult = {
  inputWords: 1,
  newWords: ['cat'],
  uniqueLemmas: 1,
  lemmas: ['cat'],
  forms: [{ form: 'cats', lemma: 'cat', tag: 'N' }],
  taggedTokens: [{ token: 'cat', lemma: 'cat', tag: 'N' }],
  relations: [],
  model: 'model',
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const requiredFinishButton = (container: HTMLDivElement): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('wizard.summary.finishSave'));
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
};

describe('WizardSummary save recovery', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useWizardStore.getState().reset();
    useWizardStore.setState({ keywordsText: 'cat', processingResult, run: { status: 'ready', sessionId: 'session', completedPhase: 'ready' } });
    vi.mocked(WorkflowService.saveWizardResults).mockClear();
    vi.mocked(WorkflowService.saveWizardResults).mockResolvedValue(1);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('shows an inline alert and keeps retry available when saving fails', async () => {
    vi.mocked(WorkflowService.saveWizardResults).mockRejectedValue(new Error('database offline'));
    const alert = vi.spyOn(window, 'alert');
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(alert).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('wizard.save_error');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('database offline');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('wizard.summary.finishSave'))).toBe(true);
    alert.mockRestore();
  });

  it('shows two explicit post-save choices without confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(confirm).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('wizard.save_success');
    expect(container.textContent).toContain('wizard.process_another');
    expect(container.textContent).toContain('wizard.return_to_input');
    confirm.mockRestore();
  });

  it('preserves duplicate source rows until the duplicate policy is enabled', () => {
    useWizardStore.setState({
      processingResult: {
        ...processingResult,
        forms: [{ form: 'cats', lemma: 'cat', tag: 'N' }, { form: 'cats', lemma: 'cat', tag: 'N' }],
        taggedTokens: [{ token: 'cat', lemma: 'cat', tag: 'N' }, { token: 'cat', lemma: 'cat', tag: 'N' }],
      },
      filters: { ...useWizardStore.getState().filters, removeDuplicates: false },
    });
    flushSync(() => root.render(<WizardSummary />));

    expect(container.textContent?.match(/cats = cat/g)).toHaveLength(2);
    expect(container.textContent?.match(/wizard\.summary\.forms(?!ToLemmas)/g)).toHaveLength(1);
  });

  it('deduplicates case-equivalent relationship rows by their configured key', () => {
    useWizardStore.setState({
      processingResult: {
        ...processingResult,
        forms: [{ form: 'PSI', lemma: 'pes', tag: 'N' }, { form: 'psi', lemma: 'PES', tag: 'N' }],
        taggedTokens: [],
      },
      filters: {
        ...useWizardStore.getState().filters,
        removeDuplicates: true,
        removeSpecialCharacters: false,
      },
    });
    flushSync(() => root.render(<WizardSummary />));

    expect(container.textContent?.match(/psi = pes/gi)).toHaveLength(1);
    expect(container.textContent).toContain('PSI = pes');
  });

  it('deduplicates relationship rows after configured special-character filtering', () => {
    useWizardStore.setState({
      processingResult: {
        ...processingResult,
        forms: [{ form: 'psi', lemma: 'pe-s', tag: 'N' }, { form: 'psi', lemma: 'PES', tag: 'N' }],
        taggedTokens: [],
      },
      filters: {
        ...useWizardStore.getState().filters,
        removeDuplicates: true,
        removeSpecialCharacters: true,
      },
    });
    flushSync(() => root.render(<WizardSummary />));

    expect(container.textContent?.match(/psi = /g)).toHaveLength(1);
  });

  it('skips relationships when stopword filtering removes only the cleaned lemma', () => {
    useWizardStore.setState({
      processingResult: {
        ...processingResult,
        forms: [{ form: 'ci', lemma: 'či_extra', tag: 'N' }],
        taggedTokens: [],
      },
      filters: {
        ...useWizardStore.getState().filters,
        removeDiacritics: false,
        removeDuplicates: false,
        removeStopWords: true,
        removeSpecialCharacters: false,
        stopWordsList: ['či'],
      },
    });
    flushSync(() => root.render(<WizardSummary />));

    expect(container.textContent).not.toContain('ci = či');
  });

  it('keeps canonically equivalent new-only sources with cleaned lemmas', () => {
    useWizardStore.setState({
      processingResult: {
        ...processingResult,
        newWords: ['ČAT'],
        taggedTokens: [{ token: 'c\u030Cat', lemma: 'pes', tag: 'N' }],
        forms: [{ form: 'běží', lemma: 'PES_extra-2', tag: 'N' }],
        relations: [{ inputToken: 'c\u030Cat', lemma: 'PES_extra-2', tag: 'N', generatedForms: [] }],
      },
      filters: { ...useWizardStore.getState().filters, showOnlyNew: true, removeSpecialCharacters: false },
    });
    flushSync(() => root.render(<WizardSummary />));

    expect(container.textContent).toContain('c\u030Cat = pes');
    expect(container.textContent).toContain('běží = PES');
  });

  it('does not compare stripped special characters when that filter is disabled', () => {
    useWizardStore.setState({
      processingResult: {
        ...processingResult,
        forms: [{ form: 'pes!', lemma: 'pes', tag: 'N' }],
        taggedTokens: [],
      },
      filters: {
        ...useWizardStore.getState().filters,
        removeDuplicates: true,
        removeDiacritics: false,
        removeSpecialCharacters: false,
      },
    });
    flushSync(() => root.render(<WizardSummary />));
    expect(container.textContent).toContain('pes! = pes');

    useWizardStore.setState({ filters: { ...useWizardStore.getState().filters, removeSpecialCharacters: true } });
    flushSync(() => root.unmount());
    root = createRoot(container);
    flushSync(() => root.render(<WizardSummary />));
    expect(container.textContent).not.toContain('pes! = pes');
  });

  it('ignores a stale successful save after the source changes', async () => {
    const save = deferred<number>();
    vi.mocked(WorkflowService.saveWizardResults).mockReturnValue(save.promise);
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    useWizardStore.getState().setKeywordsText('dog');
    save.resolve(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('idle');
    expect(container.querySelector('[role="status"]')?.textContent ?? '').not.toContain('wizard.save_success');
  });

  it('ignores a stale failed save after a new run starts', async () => {
    const save = deferred<number>();
    vi.mocked(WorkflowService.saveWizardResults).mockReturnValue(save.promise);
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    useWizardStore.getState().reset();
    save.reject(new Error('old database failure'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('idle');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not update local save state after unmount', async () => {
    const save = deferred<number>();
    vi.mocked(WorkflowService.saveWizardResults).mockReturnValue(save.promise);
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    flushSync(() => root.unmount());
    save.resolve(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('ready');
  });

  it('marks the unchanged source saved after persistence succeeds', async () => {
    const save = deferred<number>();
    vi.mocked(WorkflowService.saveWizardResults).mockReturnValue(save.promise);
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    save.resolve(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWizardStore.getState().run.status).toBe('saved');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('wizard.save_success');
  });

  it('does not discard a save solely because the global selected model changes', async () => {
    const save = deferred<number>();
    vi.mocked(WorkflowService.saveWizardResults).mockReturnValue(save.promise);
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    useApiStore.getState().setSelectedModel('another-model');
    save.resolve(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(WorkflowService.saveWizardResults).toHaveBeenCalledOnce();
    expect(useWizardStore.getState().run.status).toBe('saved');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('wizard.save_success');
  });
});
