import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMock = vi.hoisted(() => ({
  getAllData: vi.fn(),
  searchRecords: vi.fn(),
  deleteRecords: vi.fn(),
}));
const translationMock = vi.hoisted(() => ({
  t: (key: string, values?: Record<string, unknown>) => key.replace(/{{(\w+)}}/g, (_, name) => String(values?.[name] ?? `{{${name}}}`)),
}));

vi.mock('../services/database', () => ({ DatabaseService: databaseMock }));
vi.mock('../components/database/DatabaseTable', () => ({
  DatabaseTable: ({ data, selectedIds, onSelectChange }: { data: Array<{ id?: string | number }>; selectedIds: Set<string | number>; onSelectChange: (ids: Set<string | number>) => void }) => (
    <div>
      {(data.length ? data : [{ id: 1 }, { id: 2 }, { id: 3 }]).map((row) => (
        <input
          key={String(row.id)}
          type="checkbox"
          aria-label={`record-${row.id}`}
          checked={selectedIds.has(row.id as string | number)}
          onChange={(event) => {
            const next = new Set(selectedIds);
            if (event.target.checked) next.add(row.id as string | number);
            else next.delete(row.id as string | number);
            onSelectChange(next);
          }}
        />
      ))}
    </div>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => translationMock,
}));

import { DatabaseEditorPage } from './DatabaseEditorPage';

describe('DatabaseEditorPage delete flow', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderPage = async () => {
    flushSync(() => {
      root.render(<DatabaseEditorPage />);
    });
    await databaseMock.getAllData.mock.results[0]?.value;
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    flushSync(() => undefined);
  };

  const selectRecords = async (...ids: number[]) => {
    for (const id of ids) {
      const checkbox = container.querySelector<HTMLInputElement>(`[aria-label="record-${id}"]`);
      if (!checkbox) throw new Error(`missing record ${id}`);
      flushSync(() => checkbox.click());
    }
  };

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => undefined);
  };

  const openDialog = async () => {
    const trigger = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('database.delete'));
    if (!trigger) throw new Error('missing delete trigger');
    flushSync(() => trigger.click());
    flushSync(() => undefined);
    const dialog = container.querySelector<HTMLDialogElement>('dialog');
    if (!dialog) throw new Error('missing dialog');
    return { dialog, trigger };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    databaseMock.getAllData.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    databaseMock.searchRecords.mockResolvedValue([]);
    databaseMock.deleteRecords.mockResolvedValue(2);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await renderPage();
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('uses the custom dialog and deletes exactly the snapshotted ids', async () => {
    const confirm = vi.fn();
    window.confirm = confirm;
    await selectRecords(1, 3);
    const { dialog } = await openDialog();
    expect(confirm).not.toHaveBeenCalled();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.textContent).toBe('common.cancel');
    flushSync(() => [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('common.delete'))?.click());
    await settle();
    expect(databaseMock.deleteRecords).toHaveBeenCalledWith('sessions', [1, 3]);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('database.deleteSuccess');
  });

  it('cancels with the button or Escape and restores trigger focus', async () => {
    await selectRecords(1);
    const { dialog, trigger } = await openDialog();
    flushSync(() => [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('common.cancel'))?.click());
    flushSync(() => undefined);
    expect(document.activeElement).toBe(trigger);
    await selectRecords(1);
    const reopened = await openDialog();
    flushSync(() => reopened.dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    flushSync(() => undefined);
    expect(document.activeElement).toBe(reopened.trigger);
    expect(databaseMock.deleteRecords).not.toHaveBeenCalled();
  });

  it('finalizes a committed count mismatch without retrying deleted ids', async () => {
    databaseMock.deleteRecords.mockResolvedValueOnce(1);
    await selectRecords(1, 2);
    const { dialog } = await openDialog();
    flushSync(() => [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('common.delete'))?.click());
    await settle();
    expect(dialog.open).toBe(false);
    expect(databaseMock.deleteRecords).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('database.deletePartial');
    const refresh = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('database.refresh'));
    expect(document.activeElement).toBe(refresh);
  });

  it('keeps the dialog open after a service failure and permits retry', async () => {
    databaseMock.deleteRecords.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(1);
    await selectRecords(1);
    const { dialog } = await openDialog();
    const deleteButton = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('common.delete'));
    flushSync(() => deleteButton?.click());
    await settle();
    expect(dialog.open).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    flushSync(() => [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('common.delete'))?.click());
    await settle();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('database.deleteSuccess');
  });

  it('finalizes exact deletion, reports reload failure, and focuses enabled Refresh', async () => {
    databaseMock.deleteRecords.mockResolvedValueOnce(1);
    databaseMock.getAllData.mockRejectedValueOnce(new Error('reload offline'));
    await selectRecords(1);
    const { dialog } = await openDialog();
    flushSync(() => [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('common.delete'))?.click());
    await settle();
    const refresh = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('database.refresh'));
    expect(dialog.open).toBe(false);
    expect(databaseMock.deleteRecords).toHaveBeenCalledWith('sessions', [1]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('database.errorStatus');
    expect(refresh?.disabled).toBe(false);
    expect(document.activeElement).toBe(refresh);
  });

  it('ignores a slow refresh result after a newer table request completes', async () => {
    let resolveRefresh!: (rows: Array<{ id: number }>) => void;
    let resolveTable!: (rows: Array<{ id: number }>) => void;
    databaseMock.getAllData.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    databaseMock.getAllData.mockReturnValueOnce(new Promise((resolve) => { resolveTable = resolve; }));

    const refresh = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('database.refresh'));
    flushSync(() => refresh?.click());
    const tableSelect = container.querySelector<HTMLButtonElement>('button[aria-label="database.title"]');
    flushSync(() => tableSelect?.click());
    flushSync(() => document.querySelector<HTMLButtonElement>('[data-value="morphological_data"]')?.click());

    resolveTable([{ id: 22 }]);
    await settle();
    resolveRefresh([{ id: 11 }]);
    await settle();

    expect(container.querySelector('[aria-label="record-22"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="record-11"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('database.recordsLoaded');
  });

  it('ignores a stale rejection and stale finally after a newer table request succeeds', async () => {
    let rejectRefresh!: (error: Error) => void;
    let resolveTable!: (rows: Array<{ id: number }>) => void;
    databaseMock.getAllData.mockReturnValueOnce(new Promise((_, reject) => { rejectRefresh = reject; }));
    databaseMock.getAllData.mockReturnValueOnce(new Promise((resolve) => { resolveTable = resolve; }));

    const refresh = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('database.refresh'));
    flushSync(() => refresh?.click());
    const tableSelect = container.querySelector<HTMLButtonElement>('button[aria-label="database.title"]');
    flushSync(() => tableSelect?.click());
    flushSync(() => document.querySelector<HTMLButtonElement>('[data-value="morphological_data"]')?.click());

    resolveTable([{ id: 33 }]);
    await settle();
    rejectRefresh(new Error('stale failure'));
    await settle();

    expect(container.querySelector('[aria-label="record-33"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect([...container.querySelectorAll('button')].find((button) => button.textContent?.includes('database.refresh'))?.disabled).toBe(false);
  });
});
