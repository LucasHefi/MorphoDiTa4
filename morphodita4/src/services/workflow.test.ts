import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMock = vi.hoisted(() => ({
  saveWizardResults: vi.fn(),
}));

vi.mock('./database', () => ({ DatabaseService: databaseMock }));

import { WorkflowService } from './workflow';

const taggedTokens = [{ token: 'psa', lemma: 'pes', tag: 'Ncms1' }];
const generatedForms = [{ form: 'psa', lemma: 'pes', tag: 'Ncms1' }];

describe('WorkflowService.saveWizardResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('propagates database write failure instead of reporting success', async () => {
    const failure = new Error('transaction rolled back');
    databaseMock.saveWizardResults.mockRejectedValue(failure);

    await expect(
      WorkflowService.saveWizardResults(taggedTokens, generatedForms, 'czech-model', 'psa'),
    ).rejects.toBe(failure);
  });
});
