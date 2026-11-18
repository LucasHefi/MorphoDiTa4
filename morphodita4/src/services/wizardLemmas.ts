import type { AnalyzeToken, TaggedToken } from '../types/api';
import { canonicalKey, cleanLemma, removeDiacritics } from './filters';
import { WizardTaggingContractError } from './wizardPipeline';

/** The companion dictionary keeps accented lemmas while accepting unaccented forms. */
export function wizardDictionaryModel(model: string, models: Readonly<Record<string, unknown>>): string | undefined {
  if (!model.startsWith('czech-')) return undefined;
  const companion = model.includes('-no_dia') ? model : model.endsWith('-pos_only')
    ? model.replace(/-pos_only$/, '-no_dia-pos_only') : `${model}-no_dia`;
  return companion in models ? companion : undefined;
}

export function resolveWizardLemmas(tokens: TaggedToken[], requestedWords: string[], analyses: AnalyzeToken[]) {
  const key = (word: string) => canonicalKey(removeDiacritics(word));
  if (requestedWords.length !== analyses.length || analyses.some((row, i) => key(row.token) !== key(requestedWords[i]))) {
    throw new WizardTaggingContractError();
  }
  const byForm = new Map<string, AnalyzeToken['analyses']>();
  const support = new Map<string, number>();
  for (const row of analyses) {
    const form = key(row.token);
    if (byForm.has(form)) continue;
    const candidates = row.analyses.filter(a => cleanLemma(a.lemma) && !/^[XFZ]/u.test(a.tag));
    byForm.set(form, candidates);
    for (const lemma of new Set(candidates.map(a => canonicalKey(cleanLemma(a.lemma))))) {
      support.set(lemma, (support.get(lemma) ?? 0) + 1);
    }
  }
  let corrected = 0, ambiguous = 0;
  const resolved = tokens.map(token => {
    const candidates = byForm.get(key(token.token)) ?? [];
    if (!candidates.length) return token;
    const bestScore = Math.max(...candidates.map(a => support.get(canonicalKey(cleanLemma(a.lemma))) ?? 0));
    const best = candidates.filter(a => support.get(canonicalKey(cleanLemma(a.lemma))) === bestScore);
    const lemmas = new Set(best.map(a => canonicalKey(cleanLemma(a.lemma))));
    // Equal support is genuine ambiguity: retain the tagger's choice instead of inventing a base form.
    if (lemmas.size !== 1) { ambiguous++; return token; }
    const chosen = best.find(a => a.tag === token.tag) ?? best[0];
    if (canonicalKey(cleanLemma(token.lemma)) === canonicalKey(cleanLemma(chosen.lemma))) return token;
    corrected++;
    return { ...token, lemma: chosen.lemma, tag: chosen.tag };
  });
  return { tokens: resolved, corrected, ambiguous };
}
