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
    Object.defineProperty(oversizedFile, 'size', { value: 5 * 1024 * 1024 + 1 });
    Object.defineProperty(fileInput, 'files', { value: [oversizedFile] });
    flushSync(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));

    expect(container.textContent).toContain('wizard.input_file_too_large');
    const nextButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('wizard.next'));
    expect(nextButton).toBeDefined();
    flushSync(() => nextButton?.click());
    expect(useWizardStore.getState().currentStep).toBe(1);
  });

  it('exposes the browser hard input cap on the controlled textarea', () => {
    flushSync(() => root.render(<WizardInput />));

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.maxLength).toBe(MAX_WIZARD_INPUT_BYTES);
  });

  it('renders the localized interpolated word count', () => {
    useWizardStore.setState({ keywordsText: 'one two' });
    flushSync(() => root.render(<WizardInput />));
    expect(container.textContent).toContain('wizard.wordCount:{"count":2}');
    expect(container.textContent).not.toContain('Slov:');
  });
});
