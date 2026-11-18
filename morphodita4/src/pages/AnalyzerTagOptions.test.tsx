import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalyzerPage } from './AnalyzerPage';
import { MorphoDiTaAPI } from '../services/api';

vi.mock('react-i18next', async (original) => ({ ...await original<object>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../store/useApiStore', () => ({ useApiStore: () => ({
  models: { model1: { name: 'model1', language: 'Czech', description: 'test', capabilities: ['tag', 'analyze', 'generate', 'tokenize'] } },
  selectedModel: 'model1',
}) }));
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
env.IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(() => root.unmount()); container?.remove(); vi.restoreAllMocks(); });

it('submits all tag options from real controls and preserves whitespace and sentence context', async () => {
  const tag = vi.spyOn(MorphoDiTaAPI, 'tagText').mockResolvedValue({ model: 'model1', result: [] });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(() => root.render(<AnalyzerPage />));
  const click = async (element: HTMLElement) => { await act(() => element.click()); };
  const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!;
  const setInput = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(() => {
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
  };
  await click(container.querySelector('input[value="tag"]')!);
  await click(button('analyzer.advanced_options'));
  await click(container.querySelector('input[id$="-guesser"]')!);
  const choose = async (labelKey: string, option: string) => {
    const label = [...container.querySelectorAll('label')].find(l => l.textContent === labelKey)!;
    await click(document.getElementById(label.htmlFor)!);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent === option)!);
  };
  await choose('analyzer.input_format', 'analyzer.input_vertical');
  await choose('analyzer.derivation', 'path');
  await setInput(container.querySelector('input[id$="-convert-tagset"]')!, 'strip_lemma_id');
  const input = '  ' + Array(51).fill('kočka').join('\n') + '\n\nPes\nběží\n.  ';
  await setInput(container.querySelector('textarea')!, input);
  await click(button('design.process.tag'));
  expect(tag).toHaveBeenCalledTimes(1);
  expect(tag).toHaveBeenCalledWith(input, 'model1', 'json', expect.objectContaining({
    guesser: false, inputFormat: 'vertical', derivation: 'path', convertTagset: 'strip_lemma_id', signal: expect.any(AbortSignal),
  }));
});
