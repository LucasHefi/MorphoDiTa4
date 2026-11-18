import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue(1), download: vi.fn().mockResolvedValue('/Downloads/result.json') }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../store/useApiStore', () => ({ useApiStore: () => ({ models: {}, selectedModel: 'original-model' }) }));
vi.mock('../services/api', () => ({ assertModelSupportsOperation: vi.fn(), normalizeAnalyzeResult: (x: unknown) => x,
  MorphoDiTaAPI: { analyzeText: vi.fn().mockResolvedValue({ result: [[{ token: 'Kočky', lemma: 'kočka', tag: 'NN' }]] }) } }));
vi.mock('../services/workflow', () => ({ WorkflowService: { saveAnalyzerResult: mocks.save } }));
vi.mock('../services/export', async (original) => ({ ...await original<object>(), downloadFile: mocks.download }));
vi.mock('../components/analyzer', () => ({
  ModelSelector: () => null, AdvancedOptions: () => null, LogPanel: () => null,
  OperationSelector: ({ onOperationChange }: { onOperationChange: (v: string) => void }) => <button onClick={() => onOperationChange('generate')}>change-operation</button>,
  TextInput: ({ onChange }: { onChange: (v: string) => void }) => <><button onClick={() => onChange('Kočky')}>original-input</button><button onClick={() => onChange('Psi')}>changed-input</button></>,
  ResultPanel: ({ operation }: { operation: string }) => <div data-operation={operation} />,
  ExportMenu: ({ onExport }: { onExport: (v: string) => void }) => <button onClick={() => onExport('json')}>export-json</button>,
}));
import { AnalyzerPage } from './AnalyzerPage';
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
env.IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(() => root.unmount()); container?.remove(); vi.clearAllMocks(); });
it('keeps result rendering, saved input and exported metadata bound to the completed request', async () => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(() => root.render(<AnalyzerPage />));
  const click = async (name: string) => { await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === name)!.click(); }); };
  await click('original-input'); await click('design.process.analyze');
  await click('changed-input'); await click('change-operation');
  expect(container.querySelector('[data-operation]')?.getAttribute('data-operation')).toBe('analyze');
  await click('analyzer.save');
  expect(mocks.save).toHaveBeenCalledWith('analyze', [[{ token: 'Kočky', lemma: 'kočka', tag: 'NN' }]], 'original-model', 'Kočky');
  await click('export-json');
  const [content, filename] = mocks.download.mock.calls[0];
  expect(JSON.parse(content)).toMatchObject({ operation: 'analyze', input: 'Kočky', model: 'original-model' });
  expect(filename).toContain('result-analyze-');
});
