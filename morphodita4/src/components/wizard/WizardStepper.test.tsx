import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWizardStore } from '../../store/useWizardStore';
import { WizardStepper } from './WizardStepper';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'home.wizard.title': 'Localized wizard',
      'common.success': 'Localized complete',
    }[key] ?? key),
  }),
}));

describe('WizardStepper semantics', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useWizardStore.setState({ currentStep: 2 });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<WizardStepper />));
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('renders localized completion semantics without duplicating step labels', () => {
    expect(container.querySelector('ol')).not.toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(4);
    expect(container.querySelector('[aria-current="step"]')).not.toBeNull();
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Localized wizard');
    expect(container.querySelector('li')?.getAttribute('aria-label')).toBe('wizard.steps.input, Localized complete');
    expect(container.querySelector('li')?.textContent).toBe('wizard.steps.input');
    expect(container.querySelectorAll('.sr-only')).toHaveLength(0);
    expect(container.textContent).toContain('wizard.steps.input');
  });
});
