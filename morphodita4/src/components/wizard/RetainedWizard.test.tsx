import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { RetainedWizard } from './RetainedWizard';
import { useWizardStore } from '../../store/useWizardStore';
import { useApiStore } from '../../store/useApiStore';
import { MorphoDiTaAPI } from '../../services/api';
import { DatabaseService } from '../../services/database';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../analyzer/ModelSelector', () => ({ ModelSelector: () => null }));
vi.mock('../../services/api', () => ({ MorphoDiTaAPI: { tagText: vi.fn(), generateForms: vi.fn() } }));
vi.mock('../../services/database', () => ({ DatabaseService: { wordFormsExist: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function Harness() {
  return <MemoryRouter initialEntries={['/']}>
    <nav><Link to="/">overview-link</Link><Link to="/wizard">wizard-link</Link></nav>
    <RetainedWizard />
    <Routes><Route path="/" element={<div>overview-content</div>} /><Route path="/wizard" element={<></>} /></Routes>
  </MemoryRouter>;
}

describe('wizard processing across navigation', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    useWizardStore.getState().reset();
    useWizardStore.setState({ currentStep: 2, keywordsText: 'kočky\npsa' });
    useApiStore.setState({ selectedModel: 'test-model', models: {} });
    vi.mocked(DatabaseService.wordFormsExist).mockResolvedValue([]);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(() => root.unmount()); container.remove(); useWizardStore.getState().reset();
  });
  const flush = async (action?: () => void) => { await act(async () => { action?.(); await new Promise(r => setTimeout(r, 0)); }); };
  const navigate = async (text: string) => flush(() => [...container.querySelectorAll('a')].find(e => e.textContent === text)!.click());
  const tagged = { model: 'test-model', result: [[{ token: 'kočky', lemma: 'kočka', tag: 'N' }, { token: 'psa', lemma: 'pes', tag: 'N' }]] };
  const generated = { model: 'test-model', result: [[{ form: 'kočky', lemma: 'kočka', tag: 'N' }]] };

  it('continues the same pending requests while hidden and retains progress, logs and completion on return', async () => {
    const tag = deferred<typeof tagged>(), generation = deferred<typeof generated>();
    vi.mocked(MorphoDiTaAPI.tagText).mockReturnValue(tag.promise);
    vi.mocked(MorphoDiTaAPI.generateForms).mockReturnValue(generation.promise);
    await flush(() => root.render(<Harness />));
    expect(MorphoDiTaAPI.tagText).not.toHaveBeenCalled();
    await navigate('wizard-link');
    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(1);
    const session = useWizardStore.getState().run.sessionId;
    const signal = vi.mocked(MorphoDiTaAPI.tagText).mock.calls[0][3]?.signal;
    const progress = container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow');
    await navigate('overview-link');
    expect(container.querySelector('[data-wizard-workspace]')?.hasAttribute('hidden')).toBe(true);
    expect(signal?.aborted).toBe(false);
    await flush(() => tag.resolve(tagged));
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
    expect(useWizardStore.getState().run.completedPhase).toBe('analysis');
    await navigate('wizard-link');
    expect(container.querySelector('[data-wizard-workspace]')?.hasAttribute('hidden')).toBe(false);
    expect(Number(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(Number(progress));
    expect(container.textContent).toContain('wizard.processing.start');
    await navigate('overview-link');
    await flush(() => generation.resolve(generated));
    expect(useWizardStore.getState().run).toMatchObject({ status: 'ready', sessionId: session });
    await navigate('wizard-link');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect([...container.querySelectorAll('button')].find(e => e.textContent === 'wizard.next')?.disabled).toBe(false);
    expect(DatabaseService.wordFormsExist).toHaveBeenCalledTimes(1);
    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(1);
    expect(MorphoDiTaAPI.generateForms).toHaveBeenCalledTimes(1);
  });

  it('still cancels explicitly after returning and does not restart a cancelled job on navigation', async () => {
    const tag = deferred<typeof tagged>();
    vi.mocked(MorphoDiTaAPI.tagText).mockReturnValue(tag.promise);
    await flush(() => root.render(<Harness />)); await navigate('wizard-link');
    const signal = vi.mocked(MorphoDiTaAPI.tagText).mock.calls[0][3]?.signal;
    await navigate('overview-link'); await navigate('wizard-link');
    await flush(() => [...container.querySelectorAll('button')].find(e => e.textContent === 'wizard.cancel')!.click());
    expect(signal?.aborted).toBe(true);
    await flush(() => tag.resolve(tagged));
    await navigate('overview-link'); await navigate('wizard-link');
    expect(useWizardStore.getState().run.status).toBe('cancelled');
    expect(MorphoDiTaAPI.tagText).toHaveBeenCalledTimes(1);
    expect(MorphoDiTaAPI.generateForms).not.toHaveBeenCalled();
  });
});
