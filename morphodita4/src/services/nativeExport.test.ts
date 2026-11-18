import { expect, it, vi } from 'vitest';
const ipc = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: ipc }));
import { downloadFile, downloadWizardCsv } from './export';
it('waits for a completed native write and returns its destination', async () => {
  let finish!: (path: string) => void;
  ipc.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
  let completed = false;
  const pending = downloadFile('žluťoučký', 'result.txt', 'text/plain').then(path => { completed = true; return path; });
  await Promise.resolve();
  expect(completed).toBe(false);
  expect(ipc).toHaveBeenCalledWith('export_file', { filename: 'result.txt', content: 'žluťoučký' });
  finish('/Downloads/result-1.txt');
  expect(await pending).toBe('/Downloads/result-1.txt');
});
it('propagates native disk errors instead of reporting a successful download', async () => {
  ipc.mockRejectedValueOnce(new Error('Disk full'));
  await expect(downloadFile('data', 'result.json', 'application/json')).rejects.toThrow('Disk full');
});

it('passes CSV sections directly to the native writer and propagates write failures', async () => {
  const sections = [{ section: 'filteredForms', values: ['žluťoučký', '=formula'] }];
  ipc.mockResolvedValueOnce('/Downloads/result.csv');
  expect(await downloadWizardCsv(sections, 'czech', 1, 'result.csv')).toBe('/Downloads/result.csv');
  expect(ipc).toHaveBeenLastCalledWith('export_csv_sections', { filename: 'result.csv', model: 'czech', schemaVersion: 1, sections });
  ipc.mockRejectedValueOnce(new Error('Disk full'));
  await expect(downloadWizardCsv(sections, 'czech', 1, 'result.csv')).rejects.toThrow('Disk full');
});
