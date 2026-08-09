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

  it('does not report Wizard persistence success when refreshing activity fails', async () => {
    const refreshFailure = new Error('activity refresh failed');
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '7', savedCount: 2 });
    dbStoreMock.loadSessions.mockRejectedValue(refreshFailure);

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).rejects.toBe(refreshFailure);
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

  it('persists tokenize as a completed session without inventing morphology rows', async () => {
    databaseMock.createSession.mockResolvedValue({ id: '9' });

    await expect(
      WorkflowService.saveAnalyzerResult('tokenize', [[{ token: 'psa', space: '' }]], 'czech-model', 'psa'),
    ).resolves.toBe(1);

    expect(databaseMock.createSession).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'tokenize',
      result_count: 1,
      status: 'pending',
    }));
    expect(databaseMock.updateSessionStatus).toHaveBeenCalledWith('9', 'completed', 1);
    expect(databaseMock.saveWizardResults).not.toHaveBeenCalled();
    expect(dbStoreMock.loadSessions).toHaveBeenCalledTimes(1);
  });

  it('does not report tokenize persistence success when refreshing activity fails', async () => {
    const refreshFailure = new Error('activity refresh failed');
    databaseMock.createSession.mockResolvedValue({ id: '9' });
    dbStoreMock.loadSessions.mockRejectedValue(refreshFailure);

    await expect(
      WorkflowService.saveAnalyzerResult('tokenize', [[{ token: 'psa', space: '' }]], 'czech-model', 'psa'),
    ).rejects.toBe(refreshFailure);
  });

  it('does not report Analyzer persistence success when refreshing activity fails', async () => {
    const refreshFailure = new Error('activity refresh failed');
    databaseMock.saveWizardResults.mockResolvedValue({ sessionId: '8', savedCount: 1 });
    dbStoreMock.loadSessions.mockRejectedValue(refreshFailure);

    await expect(
      WorkflowService.saveAnalyzerResult('tag', [[{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }]], 'czech-model', 'psa'),
    ).rejects.toBe(refreshFailure);
  });
});
