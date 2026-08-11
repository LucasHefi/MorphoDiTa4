import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogPanel } from './LogPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

describe('LogPanel accessibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { flushSync(() => root.unmount()); container.remove(); });

  it('keeps disclosure controls separate from the named summary', () => {
    flushSync(() => root.render(<LogPanel logs={[]} onClear={vi.fn()} />));
    const details = container.querySelector('details');
    const summary = container.querySelector('summary');
    expect(details?.open).toBe(true);
    expect(summary?.textContent).toBe('analyzer.logs.title');
    expect(summary?.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('summary button')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(5);
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
    expect(container.querySelector('[role="log"]')?.getAttribute('aria-live')).toBe('polite');
    expect(container.textContent).toContain('analyzer.logs.empty');

    summary?.click();
    expect(details?.open).toBe(false);
  });
});
