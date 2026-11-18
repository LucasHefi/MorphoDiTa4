import React from 'react';
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

vi.mock('../../services/database', () => ({ DatabaseService: { wordFormsExist: vi.fn().mockRejectedValue(new Error('lookup failed')) } }));

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
    localStorage.removeItem('morphodita.summary.filters.v1');
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

  it('completes saving under React StrictMode', async () => {
    flushSync(() => root.render(<React.StrictMode><WizardSummary /></React.StrictMode>));
    flushSync(() => requiredFinishButton(container).click());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toContain('wizard.save_success');
    expect(WorkflowService.saveWizardResults).toHaveBeenCalledOnce();
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

  it('offers independent filters for each summary column', () => {
    flushSync(() => root.render(<WizardSummary />));
    const groups = container.querySelectorAll('fieldset');
    expect(groups).toHaveLength(3);
    const first = groups[0].querySelector('input') as HTMLInputElement;
    const second = groups[1].querySelector('input') as HTMLInputElement;
    flushSync(() => first.click());
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
  });

  it('blocks copy, export and saving if the requested database lookup fails', async () => {
    flushSync(() => root.render(<WizardSummary />));
    const existing = container.querySelectorAll('fieldset input')[4] as HTMLInputElement;
    flushSync(() => existing.click());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('lookup failed');
    expect(requiredFinishButton(container).disabled).toBe(true);
    const copy = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'wizard.summaryColumns.copy');
    expect(copy?.disabled).toBe(true);
  });

  it('retains independent checkbox settings after reopening the summary', () => {
    flushSync(() => root.render(<WizardSummary />));
    const first = container.querySelector('fieldset input') as HTMLInputElement;
    flushSync(() => first.click());
    flushSync(() => root.unmount());
    root = createRoot(container);
    flushSync(() => root.render(<WizardSummary />));
    const inputs = container.querySelectorAll('fieldset input');
    expect((inputs[0] as HTMLInputElement).checked).toBe(true);
    expect((inputs[5] as HTMLInputElement).checked).toBe(false);
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

  it('does not mark a replacement run saved when the model changes during a pending save', async () => {
    const save = deferred<number>();
    vi.mocked(WorkflowService.saveWizardResults).mockReturnValue(save.promise);
    flushSync(() => root.render(<WizardSummary />));
    flushSync(() => requiredFinishButton(container).click());
    useApiStore.getState().setSelectedModel('another-model');
    save.resolve(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(WorkflowService.saveWizardResults).toHaveBeenCalledOnce();
    expect(useWizardStore.getState().run.status).toBe('idle');
    expect(useWizardStore.getState().processingResult).toBeNull();
    expect(useWizardStore.getState().keywordsText).toBe('cat');
    expect(container.textContent).not.toContain('wizard.save_success');
  });
});
