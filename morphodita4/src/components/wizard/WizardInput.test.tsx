import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWizardStore } from '../../store/useWizardStore';
import { MAX_WIZARD_INPUT_BYTES } from '../../services/wizardInput';
import { WizardInput } from './WizardInput';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}` }),
}));

describe('WizardInput', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useWizardStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('does not advance after a displayed oversized file error with valid stored text', () => {
    useWizardStore.setState({ keywordsText: 'valid word' });
    flushSync(() => root.render(<WizardInput />));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversizedFile = new File(['ignored'], 'oversized.txt', { type: 'text/plain' });
    Object.defineProperty(oversizedFile, 'size', { value: MAX_WIZARD_INPUT_BYTES + 1 });
    Object.defineProperty(fileInput, 'files', { value: [oversizedFile] });
    flushSync(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));

    expect(container.textContent).toContain('wizard.input_file_too_large');
    const nextButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('design.continueProcessing'));
    expect(nextButton).toBeDefined();
    expect(nextButton?.disabled).toBe(true);
    flushSync(() => nextButton?.click());
    expect(useWizardStore.getState().currentStep).toBe(1);
  });

  it('exposes the browser hard input cap on the controlled textarea', () => {
    flushSync(() => root.render(<WizardInput />));

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.maxLength).toBe(MAX_WIZARD_INPUT_BYTES);
  });

  it('prevents proceeding when the input contains only numbers', () => {
    useWizardStore.setState({ keywordsText: '123 ٤٥ -42' });
    flushSync(() => root.render(<WizardInput />));
    const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('design.continueProcessing'));
    expect(next?.disabled).toBe(true);
    expect(container.textContent).toContain('wizard.input_digits_removed');
  });

  it('keeps a million-word paste and edits only the selected bounded page', () => {
    flushSync(() => root.render(<WizardInput />));
    const text = 'word '.repeat(1_000_000);
    const field = container.querySelector('textarea')!;
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => text } });
    flushSync(() => field.dispatchEvent(paste));
    expect(paste.defaultPrevented).toBe(true);
    expect(useWizardStore.getState().keywordsText).toBe(text);
    expect(field.value).toHaveLength(50_000);
    const page = container.querySelector('input[type="number"]')!;
    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(page, '100');
      page.dispatchEvent(new Event('input', { bubbles: true }));
    });
    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'tail');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(useWizardStore.getState().keywordsText).toBe(text.slice(0, 4_950_000) + 'tail');
    expect(field.value).toBe('tail');
  });

  it('renders the localized interpolated word count', () => {
    useWizardStore.setState({ keywordsText: 'one two' });
    flushSync(() => root.render(<WizardInput />));
    expect(container.textContent).toContain('wizard.wordCount:{"count":2}');
    expect(container.textContent).not.toContain('Slov:');
  });
});
