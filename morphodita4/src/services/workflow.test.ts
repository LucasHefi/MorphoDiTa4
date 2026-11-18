import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  saveWizardResults: vi.fn(),
  updateSessionStatus: vi.fn(),
}));

const dbStoreMock = vi.hoisted(() => ({
  loadSessions: vi.fn(),
}));

vi.mock('./database', () => ({ DatabaseService: databaseMock }));
vi.mock('../store/useDbStore', () => ({
  useDbStore: { getState: () => dbStoreMock },
}));

import { WorkflowService } from './workflow';

const taggedTokens = [{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }];
const generatedForms = [{ form: 'psa', lemma: 'pes', tag: 'Ncms1' }];

describe('WorkflowService.saveWizardResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbStoreMock.loadSessions.mockResolvedValue(undefined);
  });

  it('persists only the explicit visible rows and not the source rows', async () => {
    const visible = [{ source_type: 'analysis', original_form: 'pes', lemma: 'pes', tag: 'N', generated_form: null }];
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '7', savedCount: 1 });
    await expect(WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'model', 'input', visible)).resolves.toBe(1);
    expect(databaseMock.saveWizardResults).toHaveBeenCalledWith(expect.anything(), visible);
  });

  it('persists analysis and generation rows through the transactional database command', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '7', savedCount: 2 });

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).resolves.toBe(2);

    expect(databaseMock.saveWizardResults).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'analyze',
        model: 'czech-model',
        input_text: 'psa',
        status: 'pending',
      }),
      [
        expect.objectContaining({
          source_type: 'analysis',
          original_form: 'psa',
          lemma: 'pes',
          session_id: null,
        }),
        expect.objectContaining({
          source_type: 'generation',
          generated_form: 'psa',
          lemma: 'pes',
          session_id: null,
        }),
      ],
    );
    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(1);
  });

  it('propagates database write failure instead of reporting success', async () => {
    const failure = new Error('transaction rolled back');
    databaseMock.saveWizardResults.mockRejectedValue(failure);

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).rejects.toBe(failure);
  });

  it('returns committed Wizard persistence success when refreshing activity fails', async () => {
    const refreshFailure = new Error('activity refresh failed');
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '7', savedCount: 2 });
    dbStoreMock.loadSessions.mockRejectedValue(refreshFailure);

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).resolves.toBe(2);
    expect(databaseMock.saveWizardResults).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete transactional response as a failed save', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '7', savedCount: 1 });

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).rejects.toThrow('saved 1 of 2 rows');
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
  });

  it('rejects a transactional response without a valid session id', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '', savedCount: 2 });

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).rejects.toThrow('session id');
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
  });
});

describe('WorkflowService.saveAnalyzerResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbStoreMock.loadSessions.mockResolvedValue(undefined);
  });

  it('persists tag rows with the selected operation and source type', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '8', savedCount: 1 });

    await expect(
      WorkflowService.saveAnalyzerResult('tag', [[{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }]], 'czech-model', 'psa'),
    ).resolves.toBe(1);

    expect(databaseMock.saveWizardResults).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'tag', model: 'czech-model', input_text: 'psa' }),
      [expect.objectContaining({ source_type: 'analysis', original_form: 'psa', lemma: 'pes' })],
    );
    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(1);
  });

  it('persists token groups and spacing atomically for lossless session reload', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '9', savedCount: 0 });

    await expect(
      WorkflowService.saveAnalyzerResult('tokenize', [[{ token: 'psa', space: '' }], [{ token: 'pes', space: '' }]], 'czech-model', 'psa'),
    ).resolves.toBe(2);

    expect(databaseMock.saveWizardResults).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'tokenize', result_count: 2, status: 'pending', parameters: { workflow: 'analyzer', tokenization: [[{ token: 'psa', space: '' }], [{ token: 'pes', space: '' }]] } }),
      [],
    );
    expect(databaseMock.createSession).not.toHaveBeenCalled();
    expect(databaseMock.updateSessionStatus).not.toHaveBeenCalled();
    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(1);
  });

  it('rejects tokenize when the transactional response has the wrong saved count', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '9', savedCount: 1 });

    await expect(
      WorkflowService.saveAnalyzerResult('tokenize', [[{ token: 'psa', space: '' }]], 'czech-model', 'psa'),
    ).rejects.toThrow('saved 1 of 0 rows');
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
  });

  it('rejects an analyzer response without a valid session id', async () => {
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '', savedCount: 1 });

    await expect(
      WorkflowService.saveAnalyzerResult('tag', [[{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }]], 'czech-model', 'psa'),
    ).rejects.toThrow('session id');
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
  });

  it('does not refresh activity when analyzer persistence fails', async () => {
    const failure = new Error('transaction rolled back');
    databaseMock.saveWizardResults.mockRejectedValue(failure);

    await expect(
      WorkflowService.saveAnalyzerResult('tag', [[{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }]], 'czech-model', 'psa'),
    ).rejects.toBe(failure);
    expect(dbStoreMock.loadSessions).not.toHaveBeenCalled();
  });

  it('returns committed Analyzer persistence success when refreshing activity fails', async () => {
    const refreshFailure = new Error('activity refresh failed');
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '8', savedCount: 1 });
    dbStoreMock.loadSessions.mockRejectedValue(refreshFailure);

    await expect(
      WorkflowService.saveAnalyzerResult('tag', [[{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }]], 'czech-model', 'psa'),
    ).resolves.toBe(1);
    expect(databaseMock.saveWizardResults).toHaveBeenCalledTimes(1);
  });
});
