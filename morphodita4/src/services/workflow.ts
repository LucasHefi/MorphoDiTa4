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
  try {
    await useDbStore.getState().loadSessions();
  } catch {
    // The transaction has already committed; the store retains its refresh error.
  }
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
           probability: token.probability ?? null,
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
           probability: form.probability ?? null,
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
    if (!result.sessionId || !/^[1-9]\d*$/.test(result.sessionId)) {
      throw new Error('Wizard persistence did not return a valid session id');
    }
    if (result.savedCount !== morphData.length) {
      throw new Error(`Wizard persistence was incomplete: saved ${result.savedCount} of ${morphData.length} rows`);
    }

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
      const saved = await DatabaseService.saveWizardResults(
        {
          operation,
          model,
          input_text: inputText,
          status: 'pending',
          result_count: resultCount,
          parameters: {},
        },
        [],
      );
      if (!saved.sessionId || !/^[1-9]\d*$/.test(saved.sessionId)) {
        throw new Error('Analyzer persistence did not return a valid session id');
      }
      if (saved.savedCount !== 0) {
        throw new Error(`Analyzer persistence was incomplete: saved ${saved.savedCount} of 0 rows`);
      }
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
    if (!saved.sessionId || !/^[1-9]\d*$/.test(saved.sessionId)) {
      throw new Error('Analyzer persistence did not return a valid session id');
    }
    if (saved.savedCount !== morphData.length) {
      throw new Error(`Analyzer persistence was incomplete: saved ${saved.savedCount} of ${morphData.length} rows`);
    }
    await refreshActivity();
    return saved.savedCount;
  },
};
