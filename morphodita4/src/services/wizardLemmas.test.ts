// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveWizardLemmas, wizardDictionaryModel } from './wizardLemmas';
import type { AnalyzeResponse, TagResponse } from '../types/api';
import { summaryRows, filterColumn, defaultSummarySettings, visibleDatabaseRows } from '../components/wizard/summaryFilters';
const evidence = new URL('../../../docs/verification/2026-11-17-canonical-lemmas/', import.meta.url);
const original = JSON.parse(readFileSync(new URL('before.json', evidence), 'utf8')) as { tag: TagResponse; expected: [string, string][] };
const dictionary = JSON.parse(readFileSync(new URL('dictionary-analysis.json', evidence), 'utf8')) as AnalyzeResponse;
describe('dictionary base forms', () => {
  it('matches all 155 supplied forms using real offline dictionary responses, including negatives, degrees and omitted accents', () => {
    const result = resolveWizardLemmas(original.tag.result.flat(), original.expected.map(([word]) => word), dictionary.result.flat());
    const rows = summaryRows(result.tokens, []);
    const options = defaultSummarySettings();
    const relations = filterColumn(rows, 'relations', options.columns.relations, [], new Set());
    expect(relations).toHaveLength(155);
    for (const [word, lemma] of original.expected) expect(relations).toContain(`${word} = ${lemma}`);
    const saved = visibleDatabaseRows({ relations, forms: [], lemmas: [] }, rows, options);
    expect(saved).toHaveLength(155);
    for (const [word, lemma] of original.expected) expect(saved).toContainEqual(expect.objectContaining({ original_form: word, lemma }));
    expect(result.corrected).toBe(75);
    expect(result.ambiguous).toBe(0);
  });
  it('does not invent a base form for equal dictionary support or unknown words', () => {
    const tokens = [{ token: 'rada', lemma: 'rada', tag: 'N' }, { token: 'xyz', lemma: 'xyz', tag: 'X' }];
    const result = resolveWizardLemmas(tokens, ['rada', 'xyz'], [{ token: 'rada', analyses: [{ lemma: 'rada', tag: 'N' }, { lemma: 'řada', tag: 'N' }] }, { token: 'xyz', analyses: [] }]);
    expect(result.tokens).toEqual(tokens);
    expect(result.ambiguous).toBe(1);
  });
  it('checks dictionary token identity before applying lemmas', () => {
    expect(() => resolveWizardLemmas([{ token: 'pes', lemma: 'pes', tag: 'N' }], ['pes'], [{ token: 'kočka', analyses: [] }])).toThrow();
  });
  it('selects only available Czech companion dictionaries', () => {
    expect(wizardDictionaryModel('czech-250909', { 'czech-250909-no_dia': {} })).toBe('czech-250909-no_dia');
    expect(wizardDictionaryModel('czech-x-pos_only', { 'czech-x-no_dia-pos_only': {} })).toBe('czech-x-no_dia-pos_only');
    expect(wizardDictionaryModel('english-x', { 'english-x-no_dia': {} })).toBeUndefined();
    expect(wizardDictionaryModel('czech-250909', {})).toBeUndefined();
  });
});
