import { describe, expect, it } from 'vitest';
import type { GeneratedForm, TaggedToken } from '../types/api';
import { buildWizardRelations } from './wizardPipeline';

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
});
