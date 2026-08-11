import { describe, expect, it } from 'vitest';
import type { GeneratedForm, TaggedToken } from '../types/api';
import { buildWizardPipeline, buildWizardRelations, expandWizardTagGroups, WizardTaggingContractError } from './wizardPipeline';

const token = (inputToken: string, lemma: string): TaggedToken => ({
  token: inputToken,
  lemma,
  tag: 'Ncms1',
});

const form = (lemma: string, generatedForm: string): GeneratedForm => ({
  lemma,
  form: generatedForm,
  tag: 'Ncms1',
});

describe('wizard pipeline relations', () => {
  it('expands unique tag groups in original order and restores single-token spelling', () => {
    const expanded = expandWizardTagGroups(
      ['Cat', 'DOG'],
      ['Cat', 'cat', 'DOG', 'dog'],
      [[token('cat', 'cat')], [token('dog', 'dog')]],
    );

    expect(expanded).toEqual([
      token('Cat', 'cat'),
      token('cat', 'cat'),
      token('DOG', 'dog'),
      token('dog', 'dog'),
    ]);
  });

  it('fails closed when tag group count cannot map to unique input', () => {
    expect(() => expandWizardTagGroups(['Cat', 'DOG'], ['Cat', 'cat', 'DOG', 'dog'], [[token('cat', 'cat')]])).toThrow(WizardTaggingContractError);
  });

  it('fails closed when a tag group is empty', () => {
    expect(() => expandWizardTagGroups(['Cat'], ['Cat'], [[]])).toThrow(WizardTaggingContractError);
  });

  it('fails closed when a tag token does not match its unique input', () => {
    expect(() => expandWizardTagGroups(
      ['Cat'],
      ['Cat'],
      [[token('DOG', 'cat')]],
    )).toThrow(WizardTaggingContractError);
  });

  it('fails closed when an original canonical key has no unique representation', () => {
    expect(() => expandWizardTagGroups(
      ['Cat'],
      ['Cat', 'DOG'],
      [[token('cat', 'cat')]],
    )).toThrow(WizardTaggingContractError);
  });

  it('fails closed when unique canonical keys are duplicated', () => {
    expect(() => expandWizardTagGroups(
      ['Cat', 'cat'],
      ['Cat'],
      [[token('cat', 'cat')], [token('cat', 'cat')]],
    )).toThrow(WizardTaggingContractError);
  });

  it('preserves stable expansion for bounded duplicate-heavy input', () => {
    const originalWords = Array.from({ length: 20_000 }, (_, index) => index % 2 ? 'CAT' : 'cat');
    const expanded = expandWizardTagGroups(
      ['cat'],
      originalWords,
      [[token('cat', 'cat')]],
    );

    expect(expanded).toHaveLength(originalWords.length);
    expect(expanded.slice(0, 4).map(({ token: value }) => value)).toEqual(['cat', 'CAT', 'cat', 'CAT']);
    expect(expanded.at(-1)?.token).toBe('CAT');
  }, 1000);

  it('restores every original spelling for every analysis', () => {
    const expanded = expandWizardTagGroups(
      ['PÉS'],
      ['PÉS', 'pe\u0301s'],
      [
        [token('pés', 'pes'), token('PE\u0301S', 'pes')],
      ],
    );

    expect(expanded).toEqual([
      token('PÉS', 'pes'),
      token('PÉS', 'pes'),
      token('pe\u0301s', 'pes'),
      token('pe\u0301s', 'pes'),
    ]);
  });

  it('preserves inflected input-to-lemma-to-form relationships', () => {
    const relations = buildWizardRelations(
      [token('psa', 'pes'), token('dům', 'dům')],
      [form('pes', 'pes'), form('pes', 'psa'), form('dům', 'domu')],
    );

    expect(relations).toEqual([
      {
        inputToken: 'psa',
        lemma: 'pes',
        tag: 'Ncms1',
        generatedForms: [form('pes', 'pes'), form('pes', 'psa')],
      },
      {
        inputToken: 'dům',
        lemma: 'dům',
        tag: 'Ncms1',
        generatedForms: [form('dům', 'domu')],
      },
    ]);
  });

  it('does not attach forms from a different lemma', () => {
    const [relation] = buildWizardRelations([token('psa', 'pes')], [form('kočka', 'kočky')]);

    expect(relation.generatedForms).toEqual([]);
  });

  it('attaches forms for NFC/NFD and case-equivalent cleaned lemmas', () => {
    const [relation] = buildWizardRelations(
      [token('PSA', 'PÉS_1')],
      [form('pe\u0301s-2', 'psi')],
    );

    expect(relation.generatedForms).toEqual([form('pe\u0301s-2', 'psi')]);
  });

  it('retains every provenance edge without flattening duplicate input tokens', () => {
    const pipeline = buildWizardPipeline(
      [token('PSA', 'pes_1'), token('psa', 'pes-2')],
      [form('pes', 'psi')],
      'wizard-session-1',
    );

    expect(pipeline).toEqual([
      expect.objectContaining({
        sourceIndex: 0,
        rawLemma: 'pes_1',
        cleanLemma: 'pes',
        sessionId: 'wizard-session-1',
        generatedForms: [form('pes', 'psi')],
      }),
      expect.objectContaining({ sourceIndex: 1, rawLemma: 'pes-2', cleanLemma: 'pes' }),
    ]);
    expect(pipeline[0].token.token).toBe('PSA');
    expect(pipeline[1].token.token).toBe('psa');
  });
});
