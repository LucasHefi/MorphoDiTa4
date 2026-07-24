import { DatabaseService } from './database';
import { cleanLemma } from './filters';
import type { GeneratedForm, TaggedToken } from '../types/api';
import type { DatabasePayload } from '../types/database';

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

    return result.savedCount;
  },
};