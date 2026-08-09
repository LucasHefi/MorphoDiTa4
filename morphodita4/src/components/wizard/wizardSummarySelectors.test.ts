import { describe, expect, it } from 'vitest';
import { selectWizardSources } from './wizardSummarySelectors';

const taggedTokens = [
  { token: 'psa', lemma: 'pes', tag: 'N' },
  { token: 'kočku', lemma: 'kočka', tag: 'N' },
];

const forms = [
  { form: 'psi', lemma: 'pes', tag: 'N' },
  { form: 'kočky', lemma: 'kočka', tag: 'N' },
];

describe('wizard summary source selection', () => {
  it('keeps only new tokens and their generated forms', () => {
    const result = selectWizardSources(
      taggedTokens,
      forms,
      true,
      new Set(['psa']),
      new Set(['pes']),
    );

    expect(result.taggedTokens.map((token) => token.token)).toEqual(['psa']);
    expect(result.forms.map((form) => form.form)).toEqual(['psi']);
  });

  it('preserves all sources when the new-only filter is disabled', () => {
    const result = selectWizardSources(
      taggedTokens,
      forms,
      false,
      new Set(['psa']),
      new Set(['pes']),
    );

    expect(result).toEqual({ taggedTokens, forms });
  });
});
