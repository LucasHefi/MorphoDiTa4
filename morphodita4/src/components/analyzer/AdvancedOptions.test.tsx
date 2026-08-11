import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedOptions } from './AdvancedOptions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AdvancedOptions disclosure', () => {
  let container: HTMLDivElement;
  let root: Root;
  const props = {
    operation: 'analyze' as const,
    guesser: false,
    onGuesserChange: vi.fn(),
    inputFormat: 'untokenized' as const,
    onInputFormatChange: vi.fn(),
    derivation: 'none' as const,
    onDerivationChange: vi.fn(),
    convertTagset: '',
    onConvertTagsetChange: vi.fn(),
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<AdvancedOptions {...props} />));
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('exposes a semantic toggle and keeps it disabled when requested', () => {
    const button = container.querySelector('button')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const panelId = button.getAttribute('aria-controls');
    expect(panelId).toMatch(/^advanced-options-/);
    expect(container.querySelector(`[id="${panelId}"]`)).toBeNull();

    flushSync(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector(`[id="${panelId}"]`)!;
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe(button.id);
    expect(panel.className).toContain('motion-safe:');

    flushSync(() => root.render(<AdvancedOptions {...props} disabled />));
    const disabledButton = container.querySelector('button')!;
    expect(disabledButton.disabled).toBe(true);
    expect(disabledButton.getAttribute('aria-expanded')).toBe('true');
    flushSync(() => disabledButton.click());
    expect(disabledButton.getAttribute('aria-expanded')).toBe('true');
  });
});
