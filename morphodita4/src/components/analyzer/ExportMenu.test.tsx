import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportMenu } from './ExportMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ExportMenu', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { flushSync(() => root.unmount()); host.remove(); document.body.querySelectorAll('[role="menu"]').forEach((node) => node.remove()); });

  it('offers each export format from one compact menu trigger', () => {
    const onExport = vi.fn();
    flushSync(() => root.render(<ExportMenu onExport={onExport} />));
    expect(host.querySelectorAll('button')).toHaveLength(1);
    const trigger = host.querySelector('button') as HTMLButtonElement;
    flushSync(() => trigger.click());
    for (const format of ['csv', 'json', 'txt'] as const) {
      const item = document.body.querySelector(`[data-value="${format}"]`) as HTMLElement;
      flushSync(() => item.click());
      expect(onExport).toHaveBeenCalledWith(format);
      if (format !== 'txt') flushSync(() => trigger.click());
    }
  });
});
