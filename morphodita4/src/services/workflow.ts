import { DatabaseService } from './database';
import { cleanLemma } from './filters';
import { MorphologicalTag } from '../types/api';

export const WorkflowService = {
  /**
   * Saves results from the Keyword Wizard to the database.
   * Ported from Python's _save_results_to_db and saveWizardResults spec.
   */
  async saveWizardResults(
    taggedTokens: ({ token: string; space?: string } & MorphologicalTag)[],
    generatedForms: MorphologicalTag[][],
    model: string,
    keywordsText: string
  ): Promise<number> {
    // 1. Create session
    const session = await DatabaseService.createSession({
      operation: 'analyze',
      model: model || 'unknown',
      input_text: keywordsText || '',
      status: 'completed',
      result_count: 0,
      parameters: {}
    });
    
    if (!session.id) throw new Error("Failed to create session");
    const sessionId = session.id;

    // 2. Prepare data for batch insertion
    const morphData: any[] = [];

    // Add analysis results (from tagging)
    if (taggedTokens) {
      for (const token of taggedTokens) {
        morphData.push({
          session_id: parseInt(sessionId),
          source_type: 'analysis',
          original_form: token.token,
          lemma: cleanLemma(token.lemma),
          tag: token.tag,
          probability: token.probability || null,
          generated_form: null
        });
      }
    }

    // Add generation results
    if (generatedForms) {
      const flatGeneratedForms = (generatedForms as any).flat();
      for (const form of flatGeneratedForms) {
        morphData.push({
          session_id: parseInt(sessionId),
          source_type: 'generation',
          original_form: null,
          lemma: cleanLemma(form.lemma),
          tag: form.tag,
          generated_form: form.form,
          probability: form.probability || null
        });
      }
    }

    // 3. Insert in batch
    const savedCount = await DatabaseService.insertMorphologicalDataBatch(morphData);

    // 4. Update session status
    await DatabaseService.updateSessionStatus(sessionId, 'completed', savedCount);

    return savedCount;
  }
};