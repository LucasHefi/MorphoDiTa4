import { describe, expect, it, vi } from 'vitest';
import { defaultSummarySettings, summaryRows, filterColumn, visibleDatabaseRows, readSummarySettings, writeSummarySettings } from './summaryFilters';

const rows = [
  { value: 'pes', lemma: 'pes', source: 'pes' },
  { value: 'pés', lemma: 'jiný', source: 'pés' },
  { value: 'kočky', lemma: 'kočka', source: 'kočky' },
  { value: 'a', lemma: 'a', source: 'a' },
];

describe('summary column filters', () => {
  it('keeps dictionary base lemmas for inflected input and generated forms across summary columns and saving', () => {
    const values = ['akcionářská', 'akcionářské', 'akcionářského', 'akcionářskej', 'akcionářskejch', 'akcionářskejm'];
    const tokens = values.map(token => ({ token, lemma: 'akcionářský', tag: 'AAIS1----1A----' }));
    const generated = values.map(form => ({ form, lemma: 'akcionářský', tag: 'AAIS1----1A----' }));
    const source = summaryRows(tokens, generated);
    const settings = defaultSummarySettings();
    settings.columns.relations.duplicates = true;
    settings.columns.lemmas.duplicates = true;
    const relations = filterColumn(source, 'relations', settings.columns.relations, [], new Set());
    const lemmas = filterColumn(source, 'lemmas', settings.columns.lemmas, [], new Set());
    expect(relations).toHaveLength(values.length);
    for (const value of values) expect(relations).toContain(`${value} = akcionářský`);
    expect(lemmas).toEqual(['akcionářský']);
    const saved = visibleDatabaseRows({ relations, lemmas, forms: values }, source, settings);
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every(row => row.lemma === 'akcionářský')).toBe(true);
    settings.columns.relations.diacritics = true;
    expect(filterColumn(source, 'relations', settings.columns.relations, [], new Set())).toContain('akcionarskeho = akcionarsky');
  });
  it('strips accents from both sides of relationships and saves the exact visible relationship', () => {
    const source = summaryRows([{ token: 'akcionářského', lemma: 'akcionářský', tag: 'AAIS2----1A----' }], []);
    const settings = defaultSummarySettings();
    expect(filterColumn(source, 'relations', settings.columns.relations, [], new Set())).toEqual(['akcionářského = akcionářský']);
    settings.columns.relations.diacritics = true;
    const relations = filterColumn(source, 'relations', settings.columns.relations, [], new Set());
    expect(relations).toEqual(['akcionarskeho = akcionarsky']);
    const saved = visibleDatabaseRows({ relations, forms: [], lemmas: [] }, source, settings);
    expect(saved).toEqual([expect.objectContaining({ original_form: 'akcionarskeho', lemma: 'akcionarsky' })]);
    expect(filterColumn(source, 'lemmas', settings.columns.lemmas, [], new Set())).toEqual(['akcionářský']);
    settings.columns.relations.diacritics = false;
    expect(filterColumn(source, 'relations', settings.columns.relations, [], new Set())).toEqual(['akcionářského = akcionářský']);
  });
  it('deduplicates relationship forms regardless of lemma and after stripping diacritics', () => {
    const options = { ...defaultSummarySettings().columns.relations, duplicates: true, diacritics: true };
    expect(filterColumn(rows, 'relations', options, [], new Set())).toEqual(['a = a', 'kocky = kocka', 'pes = pes']);
  });
  it('applies shared forbidden words and fixed Czech function words independently', () => {
    const base = defaultSummarySettings();
    const options = { ...base.columns.forms, forbidden: true, functionWords: true };
    expect(filterColumn(rows, 'forms', options, ['kočky'], new Set())).toEqual(['pes', 'pés']);
    expect(filterColumn(rows, 'lemmas', base.columns.lemmas, ['kočka'], new Set())).toContain('kočka');
  });
  it('excludes exact database matches based on each column value', () => {
    const options = { ...defaultSummarySettings().columns.forms, existing: true };
    expect(filterColumn(rows, 'forms', options, [], new Set(['kočky']))).not.toContain('kočky');
    expect(filterColumn(rows, 'lemmas', options, [], new Set(['kočka']))).not.toContain('kočka');
  });
  it('saves only the union of visible values with form provenance', () => {
    const source = [
      { value: 'psi', lemma: 'pes', source: 'psi', tag: 'N', sourceType: 'generation' as const },
      { value: 'kočky', lemma: 'kočka', source: 'kočky', tag: 'N', sourceType: 'analysis' as const },
    ];
    const saved = visibleDatabaseRows({ relations: [], forms: ['psi'], lemmas: [] }, source, defaultSummarySettings());
    expect(saved).toEqual([expect.objectContaining({ source_type: 'generation', original_form: null, generated_form: 'psi', lemma: 'pes' })]);
    expect(JSON.stringify(saved)).not.toContain('kočky');
  });
  it('checks the displayed unaccented form against the database', () => {
    const options = { ...defaultSummarySettings().columns.forms, existing: true, diacritics: true };
    expect(filterColumn(rows, 'forms', options, [], new Set(['pes']))).not.toContain('pes');
  });
  it('persists and safely reloads each column and the common list', () => {
    const settings = defaultSummarySettings(); settings.columns.forms.diacritics = true; settings.forbiddenWords = ['zakázáno'];
    writeSummarySettings(settings); expect(readSummarySettings()).toEqual(settings);
    localStorage.removeItem('morphodita.summary.filters.v1');
  });
  it('uses safe defaults when stored settings are invalid', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{bad');
    expect(readSummarySettings()).toEqual(defaultSummarySettings()); spy.mockRestore();
  });
});
