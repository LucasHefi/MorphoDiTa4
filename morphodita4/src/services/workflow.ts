import { DatabaseService } from './database';
import { useDbStore } from '../store/useDbStore';
import { cleanLemma } from './filters';
import type {
  AnalyzerResult,
  DisplayMorphologicalTag,
  GeneratedForm,
  TaggedToken,
} from '../types/api';
import type { OperationType } from '../types/common';
import type { DatabasePayload } from '../types/database';

async function refreshActivity(): Promise<void> {
  await useDbStore.getState().loadSessions();
}

export const WorkflowService = {
  /**
   * Saves results from the Keyword Wizard to the database atomically.
   * Session creation, row insertion and final status update share one transaction.
   */
  async saveWizardResults(
    taggedTokens: TaggedToken[],
    generatedForms: GeneratedForm[],
    model: string,
    keywordsText: string,
  ): Promise<number> {
    const morphData: DatabasePayload[] = [];

    if (taggedTokens) {
      for (const token of taggedTokens) {
        morphData.push({
          session_id: null,
          source_type: 'analysis',
          original_form: token.token,
          lemma: cleanLemma(token.lemma),
          tag: token.tag,
          probability: token.probability || null,
          generated_form: null,
        });
      }
    }

    if (generatedForms) {
      for (const form of generatedForms) {
        morphData.push({
          session_id: null,
          source_type: 'generation',
          original_form: null,
          lemma: cleanLemma(form.lemma),
          tag: form.tag,
          generated_form: form.form,
          probability: form.probability || null,
        });
      }
    }

    const result = await DatabaseService.saveWizardResults(
      {
        operation: 'analyze',
        model: model || 'unknown',
        input_text: keywordsText || '',
        status: 'pending',
        result_count: 0,
        parameters: {},
      },
      morphData,
    );

    await refreshActivity();
    return result.savedCount;
  },

  async saveAnalyzerResult(
    operation: OperationType,
    result: AnalyzerResult,
    model: string,
    inputText: string,
  ): Promise<number> {
    const resultCount = result.reduce((count, row) => count + row.length, 0);
    if (operation === 'tokenize') {
      const session = await DatabaseService.createSession({
        operation,
        model,
        input_text: inputText,
        status: 'pending',
        result_count: resultCount,
        parameters: {},
      });
      if (!session.id) throw new Error('Analyzer session did not return an id');
      await DatabaseService.updateSessionStatus(session.id, 'completed', resultCount);
      await refreshActivity();
      return resultCount;
    }

    const morphData: DatabasePayload[] = operation === 'generate'
      ? (result as GeneratedForm[][]).flat().map((form) => ({
        session_id: null,
        source_type: 'generation',
        original_form: null,
        lemma: cleanLemma(form.lemma),
        tag: form.tag,
        generated_form: form.form,
        probability: form.probability ?? null,
      }))
      : (result as Array<Array<DisplayMorphologicalTag & { token?: string }>>).flat().map((item) => ({
        session_id: null,
        source_type: 'analysis',
        original_form: item.token ?? null,
        lemma: cleanLemma(item.lemma),
        tag: item.tag,
        generated_form: null,
        probability: item.probability ?? null,
      }));

    const saved = await DatabaseService.saveWizardResults(
      {
        operation,
        model,
        input_text: inputText,
        status: 'pending',
        result_count: resultCount,
        parameters: {},
      },
      morphData,
    );
    await refreshActivity();
    return saved.savedCount;
  },
};