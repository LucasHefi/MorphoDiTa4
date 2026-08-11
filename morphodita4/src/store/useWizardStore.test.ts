import { beforeEach, describe, expect, it } from 'vitest';
import { useWizardStore } from './useWizardStore';

describe('wizard run lifecycle', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('makes cancellation recoverable and resumes the same session', () => {
    useWizardStore.getState().setRunState({
      status: 'processing',
      sessionId: 'session-7',
      completedPhase: 'analysis',
    });
    useWizardStore.getState().cancel();
    expect(useWizardStore.getState().run).toMatchObject({
      status: 'cancelled',
      sessionId: 'session-7',
      completedPhase: 'analysis',
    });

    useWizardStore.getState().resume();
    expect(useWizardStore.getState().run).toMatchObject({
      status: 'processing',
      sessionId: 'session-7',
      completedPhase: 'analysis',
    });
  });

  it('resets run provenance and does not retain a false success state', () => {
    useWizardStore.getState().setRunState({ status: 'saved', sessionId: 'session-8', completedPhase: 'saved' });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState().run).toEqual({ status: 'idle', sessionId: '', completedPhase: 'none' });
  });

  it('keeps phase outputs for recovery and invalidates them when input changes', () => {
    useWizardStore.setState({ keywordsText: 'cat', run: {
      status: 'cancelled',
      sessionId: 'session-9',
      completedPhase: 'analysis',
      checkpoint: {
        source: { input: 'cat', model: 'model' },
        lookup: { newWords: ['cat'] },
        analysis: { taggedTokens: [{ token: 'cat', lemma: 'cat', tag: 'N' }], lemmas: ['cat'] },
      },
    } });

    useWizardStore.getState().setKeywordsText('dog');

    expect(useWizardStore.getState().run).toEqual({ status: 'idle', sessionId: '', completedPhase: 'none', checkpoint: undefined });
    expect(useWizardStore.getState().processingResult).toBeNull();
  });
});
