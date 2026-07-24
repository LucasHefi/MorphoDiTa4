import type { GeneratedForm, TaggedToken } from '../types/api';
import type { WizardTokenRelation } from '../types/common';
import { cleanLemma } from './filters';

export function buildWizardRelations(
  taggedTokens: TaggedToken[],
  generatedForms: GeneratedForm[],
): WizardTokenRelation[] {
  const formsByLemma = new Map<string, GeneratedForm[]>();
  for (const form of generatedForms) {
    const lemma = cleanLemma(form.lemma);
    const forms = formsByLemma.get(lemma) || [];
    forms.push(form);
    formsByLemma.set(lemma, forms);
  }

  return taggedTokens.map((token) => {
    const lemma = cleanLemma(token.lemma);
    return {
      inputToken: token.token,
      lemma,
      tag: token.tag,
      generatedForms: formsByLemma.get(lemma) || [],
    };
  });
}
