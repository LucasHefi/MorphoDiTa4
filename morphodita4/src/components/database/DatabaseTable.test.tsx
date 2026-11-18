import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../services/database';
import { DatabaseTable } from './DatabaseTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../services/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/database')>()),
  DatabaseService: { updateRecord: vi.fn() },
}));

describe('DatabaseTable keyboard semantics', () => {
  let container: HTMLDivElement;
  let root: Root;
  const data = [
    { id: 'a', operation: 'tag', model: 'A', input_text: 'first', parameters: {}, result_count: 1, status: 'completed' },
    { id: 'b', operation: 'analyze', model: 'B', input_text: 'second', parameters: {}, result_count: 2, status: 'failed' },
  ] as never[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DatabaseService.updateRecord).mockResolvedValue(1);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<DatabaseTable tableType="sessions" data={data} selectedIds={new Set()} onSelectChange={vi.fn()} onStatusChange={vi.fn()} onRefresh={vi.fn().mockResolvedValue(undefined)} />));
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('uses a native sort button inside sortable headers', () => {
    const header = container.querySelector('th[aria-sort]');
    expect(header?.getAttribute('role')).toBeNull();
    const sortButton = header?.querySelector('button');
    expect(sortButton).not.toBeNull();
    expect(sortButton?.className).toContain('focus-visible:ring-2');
    flushSync(() => sortButton?.click());
    expect(header?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('labels editable cells and restores focus through the effect after Escape', () => {
    const cell = [...container.querySelectorAll('tbody td')].find((item) => item.textContent === 'tag');
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute('aria-label')).toBe('common.editRecord');
    (cell as HTMLElement).focus();
    flushSync(() => { cell?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const editor = container.querySelector('input:not([type="checkbox"])');
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute('aria-label')).toBe('common.editRecord');
    expect(document.activeElement).toBe(editor);
    flushSync(() => { editor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.activeElement).toBe(cell);
  });

  it('keeps a failed save open with the draft and retries after correction', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(DatabaseService.updateRecord).mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(1);
    flushSync(() => root.render(<DatabaseTable tableType="sessions" data={data} selectedIds={new Set()} onSelectChange={vi.fn()} onStatusChange={vi.fn()} onRefresh={refresh} />));
    const cell = [...container.querySelectorAll('tbody td')].find((item) => item.textContent === 'tag') as HTMLElement;
    flushSync(() => { cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const editor = () => container.querySelector('input:not([type="checkbox"])') as HTMLInputElement | null;
    editor()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor()).not.toBeNull();
    expect(editor()?.value).toBe('tag');
    expect(editor()?.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const input = editor()!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    flushSync(() => {
      setInputValue.call(input, 'retagged');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(DatabaseService.updateRecord).toHaveBeenCalledTimes(2);
    expect(DatabaseService.updateRecord).toHaveBeenLastCalledWith('sessions', 'a', 'operation', 'retagged');
    expect(editor()).toBeNull();
  });

  it('rejects invalid numeric drafts without invoking the service', async () => {
    const numericData = [{ id: 'a', operation: 'tag', model: 'A', input_text: 'first', parameters: {}, result_count: undefined, status: 'completed' }] as never[];
    flushSync(() => root.render(<DatabaseTable tableType="sessions" data={numericData} selectedIds={new Set()} onSelectChange={vi.fn()} onStatusChange={vi.fn()} onRefresh={vi.fn().mockResolvedValue(undefined)} />));
    const cell = [...container.querySelectorAll('tbody td')].find((item) => item.textContent === '-') as HTMLElement;
    flushSync(() => { cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const editor = container.querySelector('input:not([type="checkbox"])') as HTMLInputElement;
    flushSync(() => { editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(DatabaseService.updateRecord).not.toHaveBeenCalled();
    expect(editor).toBe(container.querySelector('input:not([type="checkbox"])'));
    expect(editor.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not make noneditable cells look editable', () => {
    const cell = [...container.querySelectorAll('tbody td')].find((item) => item.textContent === 'a') as HTMLElement;
    expect(cell.className).not.toContain('cursor-pointer');
  });

  it('closes the editor after a successful save', async () => {
    const cell = [...container.querySelectorAll('tbody td')].find((item) => item.textContent === 'tag') as HTMLElement;
    flushSync(() => { cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    container.querySelector('input:not([type="checkbox"])')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('input:not([type="checkbox"])')).toBeNull();
  });

  it('keeps the committed save closed when refresh fails and reports an actionable alert', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('reload failed'));
    const status = vi.fn();
    flushSync(() => root.render(<DatabaseTable tableType="sessions" data={data} selectedIds={new Set()} onSelectChange={vi.fn()} onStatusChange={status} onRefresh={refresh} />));
    const cell = [...container.querySelectorAll('tbody td')].find((item) => item.textContent === 'tag') as HTMLElement;
    flushSync(() => { cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    container.querySelector('input:not([type="checkbox"])')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input:not([type="checkbox"])')).toBeNull();
    expect(status).toHaveBeenNthCalledWith(1, 'database.saved');
    expect(status).toHaveBeenNthCalledWith(2, 'database.errorStatus');
  });

  it('bounds large session text and tooltips while editing and saving the complete value', async () => {
    const input = 'kočka '.repeat(276812) + 'konec';
    const longData = [{ id: 'large', operation: 'tag', model: 'A', input_text: input, parameters: {}, result_count: 1, status: 'completed' }];
    flushSync(() => root.render(<DatabaseTable tableType="sessions" data={longData as never[]} selectedIds={new Set()} onSelectChange={vi.fn()} onStatusChange={vi.fn()} onRefresh={vi.fn().mockResolvedValue(undefined)} />));
    const cell = [...container.querySelectorAll('tbody td')].find(td => td.textContent?.startsWith('kočka')) as HTMLElement;
    expect(cell.textContent!.length).toBeLessThanOrEqual(320);
    expect(cell.querySelector('span')!.title.length).toBeLessThanOrEqual(320);
    expect(cell.textContent).toMatch(/…$/);
    expect(container.textContent!.length).toBeLessThan(2000);
    flushSync(() => cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const editor = cell.querySelector('input')!;
    expect(editor.value).toBe(input);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(DatabaseService.updateRecord).toHaveBeenCalledWith('sessions', 'large', 'input_text', input);
    expect(cell.textContent!.length).toBeLessThanOrEqual(320);
  });

});
