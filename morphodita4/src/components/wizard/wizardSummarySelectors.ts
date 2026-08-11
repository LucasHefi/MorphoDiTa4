import type { GeneratedForm, TaggedToken } from '../../types/api';
import { canonicalKey, cleanLemma } from '../../services/filters';

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

  const newWordKeys = new Set([...newWordsSet].map(canonicalKey));
  const newLemmaKeys = new Set(
    [...newLemmasSet]
      .map(cleanLemma)
      .filter((lemma) => lemma.length > 0)
      .map(canonicalKey),
  );

  return {
    taggedTokens: taggedTokens.filter((token) => newWordKeys.has(canonicalKey(token.token))),
    forms: forms.filter((form) => {
      const lemma = cleanLemma(form.lemma);
      return lemma.length > 0 && newLemmaKeys.has(canonicalKey(lemma));
    }),
  };
}
