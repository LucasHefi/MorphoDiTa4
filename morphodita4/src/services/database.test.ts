import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandMissingError,
  DatabaseError,
  DatabaseService,
  NotInTauriError,
  ValidationError,
  MAX_DATABASE_INPUT_BYTES,
} from './database';
import * as tauriApi from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

function enableTauriRuntime() {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
}

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableTauriRuntime();
  });

  afterEach(() => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;
  });

  it('createSession calls invoke with correct arguments', async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue(1);

    const result = await DatabaseService.createSession({ input_text: 'Test Session' });

    expect(tauriApi.invoke).toHaveBeenCalledWith('create_session', {
      session: {
        operation: 'analyze',
        model: '',
        input_text: 'Test Session',
        parameters: '{}',
        status: 'pending',
        result_count: 0,
      },
    });
    expect(result.id).toEqual('1');
  });

  it('rejects an invalid zero session id instead of reporting success', async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue(0);

    await expect(DatabaseService.createSession({ input_text: 'Invalid' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('insertMorphologicalData calls invoke with correct arguments', async () => {
    const mockData = {
      session_id: '1',
      source_type: 'word' as const,
      word: 'test',
      lemma: 'test',
      tag: 'NNIS1-----A----',
    };
    vi.mocked(tauriApi.invoke).mockResolvedValue(1);

    const result = await DatabaseService.insertMorphologicalData(mockData);

    expect(tauriApi.invoke).toHaveBeenCalledWith('insert_morphological_data', { data: [mockData] });
    expect(result).toBe(1);
  });

  it('classifies a missing Tauri command without returning a fallback', async () => {
    vi.mocked(tauriApi.invoke).mockRejectedValue('command not found: get_sessions');

    await expect(DatabaseService.getSessions()).rejects.toBeInstanceOf(CommandMissingError);
  });

  it('classifies database errors instead of returning a silent fallback', async () => {
    vi.mocked(tauriApi.invoke).mockRejectedValue(new Error('database unavailable'));

    await expect(DatabaseService.getSessions()).rejects.toBeInstanceOf(DatabaseError);
    await expect(DatabaseService.getSessions()).rejects.toThrow('get_sessions: database unavailable');
  });

  it('reports preview mode explicitly and does not invoke Tauri', async () => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;

    await expect(DatabaseService.getSessions()).rejects.toBeInstanceOf(NotInTauriError);
    expect(tauriApi.invoke).not.toHaveBeenCalled();
  });

  it('uses one batch invoke for a 10,000-word existing-form lookup', async () => {
    const words = Array.from({ length: 10_000 }, (_, index) => `word${index}`);
    vi.mocked(tauriApi.invoke).mockResolvedValue(['word1', 'word9999']);

    await expect(DatabaseService.wordFormsExist(words)).resolves.toEqual(['word1', 'word9999']);
    expect(tauriApi.invoke).toHaveBeenCalledTimes(1);
    expect(tauriApi.invoke).toHaveBeenCalledWith('word_forms_exist', { words });
  });

  it('checks 1,000,000 words in one hundred bounded native calls and retains first-seen matches', async () => {
    const words = Array.from({ length: 1_000_000 }, (_, index) => `w${index}`);
    vi.mocked(tauriApi.invoke).mockImplementation(async (_command, args) => {
      const batch = (args as { words: string[] }).words;
      return [batch[0], 'shared'];
    });
    const matched = await DatabaseService.wordFormsExist(words, true);
    expect(tauriApi.invoke).toHaveBeenCalledTimes(100);
    for (const [command, args] of vi.mocked(tauriApi.invoke).mock.calls) {
      expect(command).toBe('word_forms_exist');
      expect((args as { words: string[] }).words).toHaveLength(10_000);
      expect(args).toMatchObject({ includeLemmas: true });
    }
    expect(matched).toEqual(['w0', 'shared', ...Array.from({ length: 99 }, (_, index) => `w${(index + 1) * 10_000}`)]);
  });

  it('rejects a lookup above 1,000,000 words before invoking native commands', async () => {
    await expect(DatabaseService.wordFormsExist(Array(1_000_001).fill('word'))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(tauriApi.invoke).not.toHaveBeenCalled();
  });

  it('rejects direct IPC lookup input above the shared 10 MB budget', async () => {
    const words = ['a'.repeat(MAX_DATABASE_INPUT_BYTES + 1)];

    await expect(DatabaseService.wordFormsExist(words)).rejects.toMatchObject({
      code: 'VALIDATION',
      command: 'word_forms_exist',
    });
    expect(tauriApi.invoke).not.toHaveBeenCalled();
  });

  it('does not invoke Tauri for an empty existing-form lookup', async () => {
    await expect(DatabaseService.wordFormsExist([])).resolves.toEqual([]);
    expect(tauriApi.invoke).not.toHaveBeenCalled();
  });

  it('uses one atomic invoke for Wizard session and rows', async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue({ session_id: 7, saved_count: 2 });

    const result = await DatabaseService.saveWizardResults(
      { input_text: 'Wizard input', model: 'm1' },
      [
        { session_id: '0', source_type: 'analysis', lemma: 'alpha', tag: 'N' },
        { session_id: '0', source_type: 'generation', lemma: 'beta', tag: 'N' },
      ],
    );

    expect(tauriApi.invoke).toHaveBeenCalledWith('save_wizard_results', {
      request: {
        session: {
          operation: 'analyze',
          model: 'm1',
          input_text: 'Wizard input',
          parameters: '{}',
          status: 'pending',
          result_count: 0,
        },
        data: [
          { session_id: '0', source_type: 'analysis', lemma: 'alpha', tag: 'N' },
          { session_id: '0', source_type: 'generation', lemma: 'beta', tag: 'N' },
        ],
      },
    });
    expect(result).toEqual({ sessionId: '7', savedCount: 2 });
  });

  it('normalizes string ids before calling Rust i64 commands', async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue(1);

    await DatabaseService.deleteRecords('sessions', ['7']);
    expect(tauriApi.invoke).toHaveBeenCalledWith('delete_sessions', { ids: [7] });

    const affected = await DatabaseService.updateRecord('sessions', '7', 'model', 'm2');
    expect(affected).toBe(1);
    expect(tauriApi.invoke).toHaveBeenCalledWith('update_session', {
      id: 7,
      field: 'model',
      value: 'm2',
    });
  });

  it('passes server-side pagination to database searches', async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue([]);

    await DatabaseService.searchRecords('sessions', 'model', ['model'], 50, 100);

    expect(tauriApi.invoke).toHaveBeenCalledWith('search_sessions', {
      searchTerm: 'model',
      fields: ['model'],
      limit: 50,
      offset: 100,
    });
  });
});
