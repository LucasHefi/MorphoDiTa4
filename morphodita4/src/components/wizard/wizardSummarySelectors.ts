import type { GeneratedForm, TaggedToken } from '../../types/api';
import { cleanLemma } from '../../services/filters';

export interface WizardSourceSelection {
  taggedTokens: TaggedToken[];
  forms: GeneratedForm[];
}

export function selectWizardSources(
  taggedTokens: TaggedToken[],
  forms: GeneratedForm[],
  showOnlyNew: boolean,
  newWordsSet: ReadonlySet<string>,
  newLemmasSet: ReadonlySet<string>,
): WizardSourceSelection {
  if (!showOnlyNew) return { taggedTokens, forms };

  return {
    taggedTokens: taggedTokens.filter((token) => newWordsSet.has(token.token.toLowerCase())),
    forms: forms.filter((form) => newLemmasSet.has(cleanLemma(form.lemma).toLowerCase())),
  };
}
