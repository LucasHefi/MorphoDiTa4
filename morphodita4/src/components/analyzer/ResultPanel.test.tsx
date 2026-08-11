import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultPanel } from './ResultPanel';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ResultPanel copy feedback', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    flushSync(() => root.render(<ResultPanel result={[]} operation="tag" />));
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('prevents duplicate writes while copying and exposes actionable success feedback', async () => {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('analyzer.results.copy'));
    expect(button).toBeDefined();
    flushSync(() => button?.click());
    flushSync(() => button?.click());
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(button?.getAttribute('disabled')).not.toBeNull();
    expect(button?.getAttribute('aria-busy')).toBe('true');
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toContain('analyzer.results.copied'));
    expect(button?.getAttribute('disabled')).toBeNull();
    expect(button?.getAttribute('aria-busy')).toBe('false');
  });

  it('exposes rejection as an alert and permits a successful retry', async () => {
    const writeText = vi.fn()
      .mockRejectedValueOnce(new Error('clipboard unavailable'))
      .mockResolvedValueOnce(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('analyzer.results.copy'));
    expect(button).toBeDefined();

    flushSync(() => button?.click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('analyzer.results.copyError'));
    expect(writeText).toHaveBeenCalledTimes(1);

    flushSync(() => button?.click());
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toContain('analyzer.results.copied'));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('uses localized accessible table labels for morphological and token results', () => {
    expect(container.querySelector('table')?.getAttribute('aria-label')).toBe('analyzer.results.morphologicalTable');
    flushSync(() => root.render(<ResultPanel result={[]} operation="tokenize" />));
    expect(container.querySelector('table')?.getAttribute('aria-label')).toBe('analyzer.results.tokenTable');
  });
});
