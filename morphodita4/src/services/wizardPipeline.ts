import type { GeneratedForm, TaggedToken } from '../types/api';
import type { WizardPipelineInput, WizardTokenRelation } from '../types/common';
import { canonicalKey, cleanLemma } from './filters';

export class WizardTaggingContractError extends Error {
  constructor() {
    super('wizard.processing.taggingContractMismatch');
    this.name = 'WizardTaggingContractError';
  }
}

export function expandWizardTagGroups(
  uniqueWords: readonly string[],
  originalWords: readonly string[],
  tagGroups: readonly TaggedToken[][],
): TaggedToken[] {
  if (tagGroups.length !== uniqueWords.length) throw new WizardTaggingContractError();
  if (tagGroups.some((group) => group.length === 0)) throw new WizardTaggingContractError();

  const uniqueKeyCounts = new Map<string, number>();
  for (const word of uniqueWords) {
    const key = canonicalKey(word);
    uniqueKeyCounts.set(key, (uniqueKeyCounts.get(key) ?? 0) + 1);
  }
  const originalKeys = new Set(originalWords.map(canonicalKey));
  if (originalKeys.size !== uniqueKeyCounts.size || [...uniqueKeyCounts.values()].some((count) => count !== 1)) {
    throw new WizardTaggingContractError();
  }
  for (const key of originalKeys) {
    if (!uniqueKeyCounts.has(key)) throw new WizardTaggingContractError();
  }
  for (const [uniqueIndex, group] of tagGroups.entries()) {
    const expectedKey = canonicalKey(uniqueWords[uniqueIndex]);
    if (group.some((token) => canonicalKey(token.token) !== expectedKey)) {
      throw new WizardTaggingContractError();
    }
  }

  const originalsByKey = new Map<string, string[]>();
  for (const word of originalWords) {
    const key = canonicalKey(word);
    const originals = originalsByKey.get(key) ?? [];
    originals.push(word);
    originalsByKey.set(key, originals);
  }

  return uniqueWords.flatMap((word, uniqueIndex) => {
    const originals = originalsByKey.get(canonicalKey(word));
    const group = tagGroups[uniqueIndex];
    if (!originals || !group) throw new WizardTaggingContractError();
    return originals.flatMap((original) => group.map((token) => ({ ...token, token: original })));
  });
}

export function buildWizardRelations(
  taggedTokens: TaggedToken[],
  generatedForms: GeneratedForm[],
  sessionId = '',
): WizardTokenRelation[] {
  const formsByLemma = new Map<string, GeneratedForm[]>();
  for (const form of generatedForms) {
    const lemma = cleanLemma(form.lemma);
    const key = canonicalKey(lemma);
    const forms = formsByLemma.get(key) || [];
    forms.push(form);
    formsByLemma.set(key, forms);
  }

  return taggedTokens.map((token, sourceIndex) => {
    const rawLemma = token.lemma;
    const lemma = cleanLemma(rawLemma);
    return {
      inputToken: token.token,
      lemma,
      tag: token.tag,
      generatedForms: formsByLemma.get(canonicalKey(lemma)) || [],
      ...(sessionId ? { sourceIndex, rawLemma, sessionId } : {}),
    };
  });
}

export function buildWizardPipeline(
  taggedTokens: readonly TaggedToken[],
  generatedForms: readonly GeneratedForm[],
  sessionId: string,
): WizardPipelineInput[] {
  const relations = buildWizardRelations([...taggedTokens], [...generatedForms], sessionId);
  return relations.map((relation, sourceIndex) => ({
    token: taggedTokens[sourceIndex],
    sourceIndex,
    rawLemma: relation.rawLemma ?? taggedTokens[sourceIndex].lemma,
    cleanLemma: relation.lemma,
    generatedForms: relation.generatedForms,
    sessionId,
  }));
}
